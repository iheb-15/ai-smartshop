import pytest

from app.services.payment import charge_card, luhn_valid, detect_brand
from tests.conftest import SHIPPING, CARD_OK, CARD_DECLINED


def _product_id(client, name):
    return next(p["id"] for p in client.get("/products/?limit=100").json() if p["name"] == name)


def _stock(client, pid):
    return client.get(f"/products/{pid}").json()["stock"]


def test_payment_gateway_rules():
    assert luhn_valid("4242424242424242")
    assert not luhn_valid("4242424242424241")
    assert detect_brand("5555555555554444") == "Mastercard"
    ok = charge_card(100.0, "4242 4242 4242 4242", "X", 12, 2030, "123")
    assert ok.success and ok.card_last4 == "4242" and ok.card_brand == "Visa"
    declined = charge_card(100.0, "4000 0000 0000 0002", "X", 12, 2030, "123")
    assert not declined.success and "fonds" in declined.failure_reason
    expired = charge_card(100.0, "4242 4242 4242 4242", "X", 1, 2020, "123")
    assert not expired.success and "expir" in expired.failure_reason.lower()


def test_cart_rules(client, client_headers):
    pid = _product_id(client, "Casque audio studio")  # stock 5
    assert client.post("/cart/", json={"product_id": pid, "quantity": 6}, headers=client_headers).status_code == 400
    res = client.post("/cart/", json={"product_id": pid, "quantity": 2}, headers=client_headers)
    assert res.status_code == 200 and res.json()["quantity"] == 2
    item_id = res.json()["id"]
    assert client.put(f"/cart/{item_id}", json={"quantity": 9}, headers=client_headers).status_code == 400
    assert client.put(f"/cart/{item_id}", params={"quantity": 1}, headers=client_headers).json()["quantity"] == 1
    hidden = client.get("/products/?limit=100&include_hidden=true", headers=client_headers).json()
    assert client.delete("/cart/clear", headers=client_headers).json() == {"ok": True}
    assert client.get("/cart/", headers=client_headers).json() == []


def test_checkout_empty_cart(client, client_headers):
    res = client.post("/orders/checkout", json={"payment_method": "card", "card": CARD_OK, "shipping": SHIPPING}, headers=client_headers)
    assert res.status_code == 400


def test_checkout_declined_card_keeps_cart_and_creates_no_order(client, client_headers, db_session):
    from app import models

    pid = _product_id(client, "Gourde isotherme")
    client.post("/cart/", json={"product_id": pid, "quantity": 2}, headers=client_headers)
    before = db_session.query(models.Order).count()
    res = client.post("/orders/checkout", json={"payment_method": "card", "card": CARD_DECLINED, "shipping": SHIPPING}, headers=client_headers)
    assert res.status_code == 402
    assert db_session.query(models.Order).count() == before
    assert len(client.get("/cart/", headers=client_headers).json()) == 1
    failed = db_session.query(models.Payment).filter(models.Payment.status == "FAILED", models.Payment.order_id == None).count()  # noqa: E711
    assert failed >= 1
    # carte invalide (Luhn)
    bad = dict(CARD_OK, number="4242 4242 4242 4241")
    assert client.post("/orders/checkout", json={"payment_method": "card", "card": bad, "shipping": SHIPPING}, headers=client_headers).status_code == 402
    # carte manquante
    assert client.post("/orders/checkout", json={"payment_method": "card", "shipping": SHIPPING}, headers=client_headers).status_code == 400


def test_checkout_card_success_applies_promo_and_decrements_stock(client, client_headers):
    gourde = _product_id(client, "Gourde isotherme")
    earbuds = _product_id(client, "Écouteurs sans fil Pro")
    client.post("/cart/", json={"product_id": earbuds, "quantity": 1}, headers=client_headers)
    stock_before = _stock(client, earbuds)
    preview = client.get("/orders/checkout/preview", headers=client_headers).json()
    assert preview["discount"] > 0 and preview["total"] == round(2 * 35.0 + 170.1, 2)
    res = client.post("/orders/checkout", json={"payment_method": "card", "card": CARD_OK, "shipping": SHIPPING, "notes": "Sonner"}, headers=client_headers)
    assert res.status_code == 200, res.text
    order = res.json()
    assert order["status"] == "CONFIRMED" and order["payment_status"] == "PAID" and order["payment_method"] == "card"
    assert order["total"] == preview["total"]
    assert order["payments"][0]["status"] == "SUCCEEDED" and order["payments"][0]["card_last4"] == "4242"
    assert {i["product_name"] for i in order["items"]} == {"Gourde isotherme", "Écouteurs sans fil Pro"}
    assert _stock(client, earbuds) == stock_before - 1
    assert client.get("/cart/", headers=client_headers).json() == []
    me = client.get("/auth/me", headers=client_headers).json()
    assert me["city"] == "Tunis" and me["address"] == SHIPPING["address"]
    # facture : le client voit sa commande, pas celles des autres
    assert client.get(f"/orders/{order['id']}", headers=client_headers).status_code == 200
    other_order = client.get("/orders/", headers=client_headers).json()
    assert all(o["user_id"] == me["id"] for o in other_order)


def test_cash_on_delivery_then_pay_later_then_cancel_refund(client, client_headers, admin_headers):
    pid = _product_id(client, "Roman Les Vents du Sud")
    stock_before = _stock(client, pid)
    client.post("/cart/", json={"product_id": pid, "quantity": 1}, headers=client_headers)
    res = client.post("/orders/checkout", json={"payment_method": "cash_on_delivery", "shipping": SHIPPING}, headers=client_headers)
    assert res.status_code == 200
    order = res.json()
    assert order["payment_status"] == "UNPAID" and order["payments"][0]["status"] == "PENDING"
    assert _stock(client, pid) == stock_before - 1
    # paiement différé par carte
    res = client.post(f"/orders/{order['id']}/pay", json={"card": CARD_DECLINED}, headers=client_headers)
    assert res.status_code == 402
    res = client.post(f"/orders/{order['id']}/pay", json={"card": CARD_OK}, headers=client_headers)
    assert res.status_code == 200 and res.json()["payment_status"] == "PAID"
    assert client.post(f"/orders/{order['id']}/pay", json={"card": CARD_OK}, headers=client_headers).status_code == 400
    # annulation client -> remboursement + stock restauré
    res = client.post(f"/orders/{order['id']}/cancel", headers=client_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "CANCELLED" and res.json()["payment_status"] == "REFUNDED"
    assert any(p["status"] == "REFUNDED" for p in res.json()["payments"])
    assert _stock(client, pid) == stock_before
    # une commande annulée ne se réactive pas
    assert client.put(f"/orders/{order['id']}/status", params={"status": "SHIPPED"}, headers=admin_headers).status_code == 400


def test_admin_status_workflow_and_cod_collection(client, client_headers, admin_headers):
    pid = _product_id(client, "Tapis de yoga")
    client.post("/cart/", json={"product_id": pid, "quantity": 1}, headers=client_headers)
    order = client.post("/orders/checkout", json={"payment_method": "cash_on_delivery", "shipping": SHIPPING}, headers=client_headers).json()
    assert client.put(f"/orders/{order['id']}/status", params={"status": "BOGUS"}, headers=admin_headers).status_code == 400
    for status in ["PROCESSING", "SHIPPED"]:
        assert client.put(f"/orders/{order['id']}/status", json={"status": status}, headers=admin_headers).json()["status"] == status
    # le client ne peut plus annuler une commande expédiée
    assert client.post(f"/orders/{order['id']}/cancel", headers=client_headers).status_code == 400
    res = client.put(f"/orders/{order['id']}/status", params={"status": "DELIVERED"}, headers=admin_headers).json()
    assert res["status"] == "DELIVERED" and res["payment_status"] == "PAID"  # encaissé à la livraison
    # listing admin avec filtres + en-tête de pagination
    res = client.get("/orders/all", params={"payment_method": "cash_on_delivery", "limit": 5}, headers=admin_headers)
    assert res.status_code == 200 and "x-total-count" in res.headers
    assert all(o["payment_method"] == "cash_on_delivery" for o in res.json())
    assert client.get("/orders/all", headers=client_headers).status_code == 403


def test_dashboard_stats_and_exports(client, admin_headers):
    res = client.get("/dashboard/stats", params={"period": "month"}, headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    for key in ["total_revenue", "payments", "behavior", "category_revenue", "sales_timeline", "top_products"]:
        assert key in data
    assert data["payments"]["failed_attempts"] >= 1
    csv = client.get("/dashboard/export/orders.csv", headers=admin_headers)
    assert csv.status_code == 200 and "paiement" in csv.text.splitlines()[0]
