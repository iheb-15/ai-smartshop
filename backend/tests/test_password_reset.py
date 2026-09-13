def test_password_reset_otp_flow(client):
    # Email inconnu : même réponse générique (anti-énumération), sans demo_code
    res = client.post("/auth/forgot-password", json={"email": "ghost@test.com"})
    assert res.status_code == 200 and "demo_code" not in res.json()

    # Demande pour un vrai compte
    res = client.post("/auth/forgot-password", json={"email": "client@test.com"})
    assert res.status_code == 200
    code = res.json().get("demo_code")
    assert code and len(code) == 6

    # Mauvais code refusé
    assert client.post("/auth/verify-otp", json={"email": "client@test.com", "code": "000000"}).status_code == 400
    # Bon code accepté
    assert client.post("/auth/verify-otp", json={"email": "client@test.com", "code": code}).status_code == 200

    # Reset + login avec le nouveau mot de passe
    res = client.post("/auth/reset-password", json={"email": "client@test.com", "code": code, "new_password": "nouveaumdp1"})
    assert res.status_code == 200
    assert client.post("/auth/login", json={"email": "client@test.com", "password": "nouveaumdp1"}).status_code == 200

    # Code à usage unique : réutilisation refusée
    res = client.post("/auth/reset-password", json={"email": "client@test.com", "code": code, "new_password": "nouveaumdp2"})
    assert res.status_code == 400


def test_forgot_password_resend_cooldown(client):
    assert client.post("/auth/forgot-password", json={"email": "other@test.com"}).status_code == 200
    res = client.post("/auth/forgot-password", json={"email": "other@test.com"})
    assert res.status_code == 429
