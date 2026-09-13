"""Tests des briques IA en mode dégradé (sans clé API) + chemin LLM avec client Anthropic simulé."""
import json
from types import SimpleNamespace

import pytest

from app.ai import claude_client, search as ai_search, reviews_ai, chatbot, interest_prediction
from app.ai.search import parse_intent_rules, SearchIntent


class _Cat:
    def __init__(self, id, name):
        self.id, self.name = id, name


CATS = [_Cat(1, "Électronique"), _Cat(2, "Sport"), _Cat(3, "Livres & Papeterie"), _Cat(4, "Maison")]


@pytest.mark.parametrize(
    "query,expect",
    [
        ("un cadeau sport à moins de 100 dt", {"category_name": "Sport", "max_price": 100.0}),
        ("écouteurs bluetooth pas cher", {"keywords": "ecouteurs bluetooth", "sort": "cheapest"}),
        ("produits en promo entre 50 et 150 DT", {"min_price": 50.0, "max_price": 150.0, "on_promo": True}),
        ("livre de cuisine bien noté", {"category_name": "Livres & Papeterie", "sort": "rating"}),
        ("nouveautés électronique en stock", {"category_name": "Électronique", "sort": "newest", "in_stock_only": True}),
        ("quelque chose pour la maison autour de 100 dinars", {"category_name": "Maison", "min_price": 75.0, "max_price": 125.0}),
        ("montre", {"keywords": "montre", "category_name": None}),
        ("cheap running shoes under 150", {"sort": "cheapest", "max_price": 150.0}),
    ],
)
def test_rule_based_intent_parser(query, expect):
    intent = parse_intent_rules(query, CATS)
    for key, value in expect.items():
        assert getattr(intent, key) == value, (query, key, getattr(intent, key))


def test_smart_search_endpoint_rules_mode(client):
    res = client.post("/ai/search", json={"query": "ecouteur sans fil moins de 200 dt", "top_k": 5})
    assert res.status_code == 200
    data = res.json()
    assert data["mode"] == "rules"
    assert "Prix ≤ 200 DT" in data["interpretation"]["labels"]
    names = [p["name"] for p in data["results"]]
    assert names[0] == "Écouteurs sans fil Pro"
    assert "Produit retiré" not in names  # produit masqué par l'admin : jamais visible
    assert names[-1] == "Produit épuisé"  # rupture de stock : visible mais relégué en fin de liste
    assert data["results"][0]["search_score"] is not None
    res = client.post("/ai/search", json={"query": "casque en stock", "top_k": 5}).json()
    assert "Produit épuisé" not in [p["name"] for p in res["results"]]
    # repli : aucun mot-clé ne correspond -> suggestions selon les filtres
    res = client.post("/ai/search", json={"query": "trottinette électrique sport", "top_k": 5}).json()
    assert res["total"] > 0 and all(p["category_name"] == "Sport" for p in res["results"])
    assert any("Aucune correspondance" in l for l in res["interpretation"]["labels"])


def test_llm_intent_parser_with_mocked_client(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    claude_client.reset_client()
    captured = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        block = SimpleNamespace(type="tool_use", name="extract_search_filters", id="t1", input={"keywords": "écouteurs", "category": "Électronique", "max_price": 200, "min_price": None, "sort": "cheapest", "in_stock_only": True, "on_promo": False})
        return SimpleNamespace(content=[block], stop_reason="tool_use")

    monkeypatch.setattr(claude_client, "create_message", fake_create)
    intent = ai_search.parse_intent("des écouteurs pas chers dispo à moins de 200", CATS)
    assert intent.source == "llm" and intent.category_id == 1 and intent.max_price == 200.0 and intent.sort == "cheapest" and intent.in_stock_only
    assert captured["tool_choice"]["name"] == "extract_search_filters"
    claude_client.reset_client()


def test_llm_failure_falls_back_to_rules(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    claude_client.reset_client()

    def boom(**kwargs):
        raise RuntimeError("API down")

    monkeypatch.setattr(claude_client, "create_message", boom)
    intent = ai_search.parse_intent("tapis de yoga moins de 50 dt", CATS)
    assert intent.source == "rules" and intent.max_price == 50.0
    claude_client.reset_client()


def test_model_fallback_on_not_found(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    claude_client.reset_client()
    calls = []

    class FakeMessages:
        def create(self, model, **kwargs):
            calls.append(model)
            if len(calls) == 1:
                raise Exception("Error code: 404 - model: not_found_error")
            return SimpleNamespace(content=[SimpleNamespace(type="text", text="ok")], stop_reason="end_turn")

    monkeypatch.setattr(claude_client, "get_client", lambda: SimpleNamespace(messages=FakeMessages()))
    res = claude_client.create_message(max_tokens=5, messages=[])
    assert claude_client.extract_text(res) == "ok" and len(calls) == 2 and calls[0] != calls[1]
    claude_client.reset_client()


def test_review_lexicon_and_endpoint(client, client_headers):
    label, score = reviews_ai.lexicon_sentiment("Pas mal du tout, vraiment solide et pratique. Je recommande !", 4)
    assert label == "positive" and score > 0.3
    label, score = reviews_ai.lexicon_sentiment("Produit cassé à la livraison, service client inexistant. Déçu.", 1)
    assert label == "negative"
    assert "livraison" in reviews_ai.extract_aspects("Livraison rapide mais emballage abîmé")
    pid = next(p["id"] for p in client.get("/products/?limit=100").json() if p["name"] == "Enceinte bluetooth portable")
    assert client.post("/reviews/", json={"product_id": pid, "rating": 9, "comment": "x"}, headers=client_headers).status_code == 422
    assert client.post("/reviews/", json={"product_id": 9999, "rating": 5, "comment": "x"}, headers=client_headers).status_code == 404
    res = client.post("/reviews/", json={"product_id": pid, "rating": 2, "comment": "Le son grésille et la batterie est faible, très déçu."}, headers=client_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["sentiment"] == "negative" and body["sentiment_score"] < 0 and "son" in body["keywords"]
    assert body["is_verified_purchase"] is False  # ce client n'a pas acheté l'enceinte
    assert client.post("/reviews/", json={"product_id": pid, "rating": 5, "comment": "encore"}, headers=client_headers).status_code == 409
    summary = client.get(f"/reviews/product/{pid}/summary").json()
    assert summary["reviews_count"] == 1 and summary["mode"] == "rules" and "négatif" in summary["summary"]
    assert "son" in summary["cons"]


def test_review_llm_analysis_with_mocked_client(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    claude_client.reset_client()
    block = SimpleNamespace(type="tool_use", name="analyze_review", id="r1", input={"sentiment": "negative", "score": -0.55, "aspects": ["Livraison", "emballage"]})
    monkeypatch.setattr(claude_client, "create_message", lambda **kw: SimpleNamespace(content=[block], stop_reason="tool_use"))
    result = reviews_ai.analyze_review("Colis arrivé ouvert", 2)
    assert result == {"sentiment": "negative", "score": -0.55, "aspects": ["livraison", "emballage"], "mode": "llm"}
    claude_client.reset_client()


def test_recommendations(client, client_headers, other_headers):
    products = {p["name"]: p["id"] for p in client.get("/products/?limit=100").json()}
    res = client.get(f"/ai/recommendations/similar/{products['Écouteurs sans fil Pro']}")
    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    assert names and "Écouteurs sans fil Pro" not in names and "Produit retiré" not in names and "Produit épuisé" not in names
    assert all(p["recommendation_reason"] for p in res.json())
    res = client.get(f"/ai/recommendations/bought-together/{products['Écouteurs sans fil Pro']}")
    assert [p["name"] for p in res.json()] == ["Enceinte bluetooth portable"]
    # « other » a acheté écouteurs + enceinte : on ne lui re-propose pas ce qu'il a acheté
    res = client.get("/ai/recommendations/for-me", headers=other_headers)
    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    assert names and not ({"Écouteurs sans fil Pro", "Enceinte bluetooth portable"} & set(names))
    assert all(p["recommendation_reason"] and p["recommendation_score"] is not None for p in res.json())
    # visiteur anonyme : sélection populaire / promo
    res = client.get("/ai/recommendations/popular?top_k=3")
    assert res.status_code == 200 and len(res.json()) == 3
    assert client.get("/ai/recommendations/for-me").status_code == 401


def test_interest_prediction(client, client_headers, admin_headers):
    res = client.get("/ai/predictions/for-me?top_k=4", headers=client_headers)
    assert res.status_code == 200
    preds = res.json()
    assert preds and all(0.0 <= p["probability"] <= 1.0 and p["reasons"] for p in preds)
    assert "Tapis de yoga" not in [p["product"]["name"] for p in preds]  # déjà acheté
    assert preds[0]["product"]["interest_probability"] == preds[0]["probability"]
    info = client.get("/ai-admin/predictions/model", headers=admin_headers).json()
    assert info["mode"] in {"ml", "heuristic"} and info["features"] == interest_prediction.FEATURES
    assert info["feature_importances"]
    assert client.post("/ai-admin/predictions/retrain", headers=admin_headers).status_code == 200
    overview = client.get("/ai-admin/predictions/overview", headers=admin_headers).json()
    assert "customers" in overview
    res = client.get("/ai-admin/predictions/customer/2", headers=admin_headers)
    assert res.status_code == 200 and "predictions" in res.json()


def test_chatbot_fallback_mode(client, client_headers):
    def ask(message, headers=None):
        res = client.post("/ai/chat", json={"session_id": "test-session", "message": message}, headers=headers)
        assert res.status_code == 200, res.text
        return res.json()

    data = ask("Bonjour")
    assert data["mode"] == "fallback" and "Bonjour" in data["reply"]
    data = ask("je cherche des écouteurs à moins de 200 dt")
    assert "Écouteurs sans fil Pro" in data["reply"] and data["products"][0]["name"] == "Écouteurs sans fil Pro"
    data = ask("quelles sont les promotions ?")
    assert "Flash Tech" in data["reply"]
    data = ask("où en est ma commande ?")
    assert "connect" in data["reply"].lower()  # anonyme
    data = ask("où en est ma commande ?", client_headers)
    assert "Commande #" in data["reply"]
    data = ask("ajoute la gourde isotherme au panier", client_headers)
    assert "cart_updated" in data["actions"] and any(i["product"]["name"] == "Gourde isotherme" for i in client.get("/cart/", headers=client_headers).json())
    data = ask("que me recommandez-vous ?", client_headers)
    assert data["products"]
    history = client.get("/ai/chat/history", params={"session_id": "test-session"}).json()
    assert history[-1]["role"] == "assistant" and history[-2]["role"] == "user"
    client.delete("/cart/clear", headers=client_headers)


def test_chatbot_llm_tool_loop_with_mocked_client(monkeypatch, client, client_headers):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    claude_client.reset_client()
    calls = []

    def fake_create(**kwargs):
        if kwargs.get("tool_choice"):  # appel interne de l'outil de recherche (analyse d'intention) : on laisse les règles décider
            raise RuntimeError("no structured output in this test")
        calls.append(kwargs)
        if len(calls) == 1:
            assert kwargs["tools"] and kwargs["messages"][-1]["role"] == "user"
            tool = SimpleNamespace(type="tool_use", id="tu1", name="search_products", input={"query": "écouteurs", "top_k": 3})
            return SimpleNamespace(content=[tool], stop_reason="tool_use")
        # 2e tour : le résultat d'outil doit être présent dans la conversation
        last = kwargs["messages"][-1]
        assert last["role"] == "user" and last["content"][0]["type"] == "tool_result"
        payload = json.loads(last["content"][0]["content"])
        assert payload["products"][0]["name"] == "Écouteurs sans fil Pro"
        return SimpleNamespace(content=[SimpleNamespace(type="text", text="Je vous conseille les Écouteurs sans fil Pro à 170.1 DT.")], stop_reason="end_turn")

    monkeypatch.setattr(claude_client, "create_message", fake_create)
    res = client.post("/ai/chat", json={"session_id": "llm-session", "message": "des écouteurs ?"}, headers=client_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["mode"] == "llm" and "Écouteurs sans fil Pro" in data["reply"]
    assert data["products"][0]["name"] == "Écouteurs sans fil Pro"
    assert len(calls) == 2
    claude_client.reset_client()


def test_chatbot_llm_error_degrades_gracefully(monkeypatch, client):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    claude_client.reset_client()

    def boom(**kwargs):
        raise RuntimeError("quota exceeded")

    monkeypatch.setattr(claude_client, "create_message", boom)
    res = client.post("/ai/chat", json={"session_id": "llm-err", "message": "tapis de yoga"})
    assert res.status_code == 200 and res.json()["mode"] == "fallback" and res.json()["products"]
    claude_client.reset_client()


def test_ai_status_endpoint(client):
    data = client.get("/ai/status").json()
    assert data["llm_configured"] is False and data["features"]["chatbot"] == "fallback"
