def _product_id(client, name):
    return next(p["id"] for p in client.get("/products/?limit=100").json() if p["name"] == name)


def test_wishlist_toggle_and_list(client, client_headers):
    pid = _product_id(client, "Casque audio studio")
    assert client.post(f"/wishlist/{pid}", headers=client_headers).json()["in_wishlist"] is True
    assert pid in client.get("/wishlist/ids", headers=client_headers).json()
    items = client.get("/wishlist/", headers=client_headers).json()
    assert items[0]["product"]["name"] == "Casque audio studio" and items[0]["product"]["effective_price"] is not None
    assert client.post(f"/wishlist/{pid}", headers=client_headers).json()["in_wishlist"] is False
    assert client.get("/wishlist/ids", headers=client_headers).json() == []
    assert client.post("/wishlist/9999", headers=client_headers).status_code == 404
    assert client.get("/wishlist/").status_code == 401


def test_events_tracking_and_recently_viewed(client, client_headers, admin_headers):
    p1 = _product_id(client, "Roman Les Vents du Sud")
    p2 = _product_id(client, "Casque audio studio")
    for pid in (p1, p2, p1):
        assert client.post("/events/", json={"event_type": "view", "product_id": pid, "session_id": "s-1"}, headers=client_headers).status_code == 201
    # anonyme accepté, produit inconnu ignoré, type invalide rejeté
    assert client.post("/events/", json={"event_type": "view", "product_id": p1, "session_id": "anon"}).json()["ok"] is True
    assert client.post("/events/", json={"event_type": "view", "product_id": 99999}).json()["ok"] is False
    assert client.post("/events/", json={"event_type": "hack", "product_id": p1}).status_code == 422
    recent = client.get("/events/recently-viewed?limit=5", headers=client_headers).json()
    assert [p["name"] for p in recent][:2] == ["Roman Les Vents du Sud", "Casque audio studio"]
    # la recherche IA et la recherche classique sont journalisées
    client.post("/ai/search", json={"query": "trottinette volante", "top_k": 3, "session_id": "s-1"})
    client.get("/products/", params={"q": "yoga", "session_id": "s-1"})
    behavior = client.get("/ai-admin/customer-behavior", headers=admin_headers).json()
    assert behavior["events_total"] > 0
    assert any(s["query"] == "trottinette volante" for s in behavior["zero_result_searches"])
    assert {f["step"] for f in behavior["funnel"]} == {"Vues produit", "Ajouts au panier", "Achats"}
    assert "segments" in behavior["rfm"] and "conversion" in behavior
    activity = client.get("/ai-admin/customers/2/activity", headers=admin_headers).json()
    assert activity["counts"].get("view", 0) >= 2 and activity["events"]


def test_reviews_analytics_and_recommendation_stats(client, admin_headers):
    data = client.get("/ai-admin/reviews-analytics", headers=admin_headers).json()
    assert data["total_reviews"] >= 1 and "products" in data and "trend" in data and data["mode"] == "rules"
    stats = client.get("/ai-admin/recommendations-stats", headers=admin_headers).json()
    assert stats["total_catalog_items"] >= 8 and "matrix" in stats and "weights" in stats
    preds = client.get("/ai-admin/predictions", headers=admin_headers).json()
    assert preds["stock_forecasts"] and preds["actionable_insights"]
