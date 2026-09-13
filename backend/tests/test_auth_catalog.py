def test_register_login_me_and_profile(client):
    res = client.post("/auth/register", json={"full_name": "Nouveau", "email": "new@test.com", "password": "motdepasse1"})
    assert res.status_code == 200
    token = res.json()["access_token"]
    assert res.json()["user"]["is_admin"] is False  # jamais admin via inscription publique
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/auth/me", headers=headers).json()["email"] == "new@test.com"
    res = client.put("/auth/me", json={"phone": "+216 11 111 111", "city": "Sfax"}, headers=headers)
    assert res.status_code == 200 and res.json()["city"] == "Sfax"
    res = client.put("/auth/me/password", json={"current_password": "bad", "new_password": "motdepasse2"}, headers=headers)
    assert res.status_code == 400
    res = client.put("/auth/me/password", json={"current_password": "motdepasse1", "new_password": "motdepasse2"}, headers=headers)
    assert res.status_code == 200
    assert client.post("/auth/login", json={"email": "new@test.com", "password": "motdepasse2"}).status_code == 200


def test_register_rejects_weak_password_and_duplicate(client):
    assert client.post("/auth/register", json={"full_name": "X Y", "email": "weak@test.com", "password": "short"}).status_code == 422
    assert client.post("/auth/register", json={"full_name": "X Y", "email": "client@test.com", "password": "longenough1"}).status_code == 400


def test_oauth2_form_token_for_swagger(client):
    res = client.post("/auth/token", data={"username": "client@test.com", "password": "client12345"})
    assert res.status_code == 200 and res.json()["access_token"]


def test_admin_endpoints_require_admin(client, client_headers):
    assert client.get("/dashboard/stats", headers=client_headers).status_code == 403
    assert client.get("/dashboard/stats").status_code == 401


def test_catalog_hides_unavailable_products_and_exposes_prices(client, admin_headers):
    res = client.get("/products/?limit=100")
    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    assert "Produit retiré" not in names
    assert res.headers["x-total-count"] == str(len(names))
    earbuds = next(p for p in res.json() if p["name"] == "Écouteurs sans fil Pro")
    assert earbuds["effective_price"] == 170.1  # -10 % Flash Tech
    assert earbuds["active_promotion"]["name"] == "Flash Tech"
    assert earbuds["category_name"] == "Électronique"
    assert earbuds["avg_rating"] == 5.0 and earbuds["reviews_count"] == 1
    # produit masqué : 404 pour le public, visible pour l'admin
    hidden_id = next(p["id"] for p in client.get("/products/?limit=100&include_hidden=true", headers=admin_headers).json() if p["name"] == "Produit retiré")
    assert client.get(f"/products/{hidden_id}").status_code == 404
    assert client.get(f"/products/{hidden_id}", headers=admin_headers).status_code == 200


def test_catalog_filters_and_sorts(client):
    res = client.get("/products/", params={"max_price": 50, "in_stock": True})
    assert all(p["price"] <= 50 and p["stock"] > 0 for p in res.json())
    res = client.get("/products/", params={"sort_by": "price_asc"})
    prices = [p["price"] for p in res.json()]
    assert prices == sorted(prices)
    res = client.get("/products/", params={"sort_by": "rating"})
    assert res.json()[0]["name"] == "Écouteurs sans fil Pro"
    res = client.get("/products/", params={"q": "yoga"})
    assert [p["name"] for p in res.json()] == ["Tapis de yoga"]


def test_admin_product_crud_and_category_guard(client, admin_headers):
    res = client.post("/products/", json={"name": "Test produit", "description": "d", "price": 10, "stock": 2, "category_id": 999}, headers=admin_headers)
    assert res.status_code == 404
    res = client.post("/products/", json={"name": "Test produit", "description": "d", "price": 10, "stock": 2}, headers=admin_headers)
    assert res.status_code == 200
    pid = res.json()["id"]
    res = client.patch(f"/products/{pid}/availability", headers=admin_headers)
    assert res.json()["is_available"] is False
    assert client.delete(f"/products/{pid}", headers=admin_headers).json() == {"ok": True}
