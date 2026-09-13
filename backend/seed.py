"""Peuple la base avec un jeu de données de démonstration réaliste.

    python seed.py            # idempotent : n'ajoute que ce qui manque
    python seed.py --reset    # supprime et recrée toutes les tables avant de peupler

Le jeu de données est déterministe (graine fixe) et conçu pour alimenter les briques IA :
personas clients avec des affinités de catégories, 90 jours de commandes / paiements simulés,
clickstream (vues, recherches, paniers, favoris), avis analysés, promotions, paniers abandonnés.
"""
import json
import random
import sys
from datetime import datetime, timedelta

from app.database import SessionLocal, engine, Base, migrate_schema
from app import models
from app.auth import hash_password
from app.ai.reviews_ai import lexicon_sentiment, extract_aspects

RESET = "--reset" in sys.argv
random.seed(42)

if RESET:
    Base.metadata.drop_all(bind=engine)
    print("Tables supprimées (--reset)")
Base.metadata.create_all(bind=engine)
migrate_schema()
db = SessionLocal()
NOW = datetime.utcnow()


def img(seed: str) -> str:
    return f"https://picsum.photos/seed/{seed}/600/600"


# --------------------------------------------------------------------------- utilisateurs
demo_users = [
    ("Admin NéoShop", "admin@shop.com", "admin123", True),
    ("Client Démo", "client@shop.com", "client123", False),
    ("Amine Ben Salah", "amine@example.com", "client123", False),
    ("Sarra Trabelsi", "sarra@example.com", "client123", False),
    ("Yassine Gharbi", "yassine@example.com", "client123", False),
    ("Nour Chaabane", "nour@example.com", "client123", False),
    ("Mehdi Jlassi", "mehdi@example.com", "client123", False),
    ("Inès Bouazizi", "ines@example.com", "client123", False),
    ("Karim Mansour", "karim@example.com", "client123", False),
    ("Leïla Hammami", "leila@example.com", "client123", False),
    ("Omar Dridi", "omar@example.com", "client123", False),
    ("Rania Saïdi", "rania@example.com", "client123", False),
]
cities = ["Tunis", "Sfax", "Sousse", "Nabeul", "Bizerte", "Monastir", "Ariana", "Gabès"]
created_users = []
for i, (full_name, email, password, is_admin) in enumerate(demo_users):
    if db.query(models.User).filter(models.User.email == email).first() is None:
        db.add(
            models.User(
                full_name=full_name,
                email=email,
                hashed_password=hash_password(password),
                is_admin=is_admin,
                phone=None if is_admin else f"+216 {random.randint(20, 99)} {random.randint(100, 999)} {random.randint(100, 999)}",
                address=None if is_admin else f"{random.randint(1, 120)} avenue Habib Bourguiba",
                city=None if is_admin else random.choice(cities),
                postal_code=None if is_admin else str(random.randint(1000, 8999)),
                created_at=NOW - timedelta(days=(2 if email == "rania@example.com" else random.randint(60, 120))),
            )
        )
        created_users.append(email)
if created_users:
    db.commit()
    print(f"{len(created_users)} utilisateurs créés (admin@shop.com / admin123, client@shop.com / client123, *@example.com / client123)")

users = {u.email: u for u in db.query(models.User).all()}

# --------------------------------------------------------------------------- catégories
if db.query(models.Category).count() == 0:
    db.add_all(
        [
            models.Category(name="Électronique", description="Gadgets, audio, accessoires et high-tech"),
            models.Category(name="Mode", description="Vêtements, chaussures et accessoires"),
            models.Category(name="Maison", description="Décoration, cuisine et équipement pour la maison"),
            models.Category(name="Sport", description="Équipements et vêtements de sport et fitness"),
            models.Category(name="Beauté & Santé", description="Soins, cosmétiques et bien-être"),
            models.Category(name="Livres & Papeterie", description="Livres, carnets et fournitures"),
        ]
    )
    db.commit()
    print("6 catégories créées")
cats = {c.name: c for c in db.query(models.Category).all()}

# --------------------------------------------------------------------------- produits
PRODUCTS = [
    # Électronique
    ("Écouteurs sans fil Pro", "Écouteurs bluetooth avec réduction de bruit active, autonomie 24h, étui de charge rapide", 189.0, None, 25, "Électronique", "earbuds"),
    ("Montre connectée Fit", "Suivi cardio, sommeil, GPS, notifications, étanche 5 ATM", 249.0, 219.0, 15, "Électronique", "watch"),
    ("Chargeur rapide 65W USB-C", "Chargeur GaN compact pour laptop, tablette et smartphone, 3 ports", 59.0, None, 40, "Électronique", "charger"),
    ("Enceinte bluetooth portable", "Enceinte compacte étanche IPX7 avec basses puissantes, 12h d'autonomie", 79.0, None, 28, "Électronique", "speaker"),
    ("Casque audio studio", "Casque circum-aural fermé, son haute fidélité, coussinets mémoire de forme", 159.0, None, 12, "Électronique", "headphones"),
    ("Batterie externe 20000 mAh", "Power bank charge rapide 22,5W, double sortie USB, écran LED", 69.0, None, 35, "Électronique", "powerbank"),
    ("Clavier mécanique compact", "Clavier 75% rétroéclairé RGB, switches rouges silencieux, USB-C détachable", 129.0, None, 18, "Électronique", "keyboard"),
    ("Webcam Full HD 1080p", "Webcam avec micro stéréo et correction de lumière, idéale télétravail", 89.0, 79.0, 22, "Électronique", "webcam"),
    # Mode
    ("Sac à dos voyage 40L", "Sac à dos léger et résistant pour voyager en cabine, plusieurs compartiments, port USB", 129.0, None, 18, "Mode", "backpack"),
    ("Veste imperméable", "Veste légère coupe-vent et imperméable pour l'extérieur, capuche ajustable", 99.0, None, 22, "Mode", "jacket"),
    ("Baskets urbaines en cuir", "Sneakers en cuir pleine fleur, semelle confort, style intemporel", 149.0, None, 20, "Mode", "sneakers"),
    ("Montre classique acier", "Montre analogique bracelet acier, verre saphir, étanche 50 m", 199.0, 169.0, 10, "Mode", "steelwatch"),
    ("Lunettes de soleil polarisées", "Monture légère, verres polarisés UV400, étui rigide inclus", 75.0, None, 30, "Mode", "sunglasses"),
    ("Écharpe en laine mérinos", "Écharpe douce et chaude, laine mérinos naturelle, plusieurs coloris", 45.0, None, 40, "Mode", "scarf"),
    # Maison
    ("Lampe de bureau LED", "Lampe design réglable avec plusieurs modes de luminosité et port de charge", 69.0, None, 20, "Maison", "lamp"),
    ("Set de rangement cuisine", "Boîtes de rangement hermétiques en verre pour cuisine, lot de 6", 39.0, None, 35, "Maison", "kitchen"),
    ("Machine à café expresso", "Machine expresso 15 bars avec buse vapeur pour cappuccino, réservoir 1,2 L", 299.0, None, 8, "Maison", "coffee"),
    ("Plaid en fausse fourrure", "Plaid ultra doux 150×200 cm, lavable en machine", 55.0, None, 25, "Maison", "blanket"),
    ("Diffuseur d'huiles essentielles", "Diffuseur ultrasonique 300 ml, éclairage d'ambiance 7 couleurs, arrêt automatique", 49.0, 39.0, 30, "Maison", "diffuser"),
    ("Robot aspirateur connecté", "Aspirateur robot avec cartographie laser, contrôle via application, autonomie 120 min", 449.0, None, 6, "Maison", "robotvac"),
    # Sport
    ("Baskets running", "Chaussures de running légères, amorti réactif, semelle antidérapante", 139.0, None, 30, "Sport", "shoes"),
    ("Tapis de yoga", "Tapis antidérapant épais 6 mm pour yoga et fitness, sangle de transport", 45.0, None, 50, "Sport", "yoga"),
    ("Haltères réglables 2×12 kg", "Paire d'haltères réglables de 2 à 12 kg, gain de place, poignées ergonomiques", 179.0, None, 12, "Sport", "dumbbells"),
    ("Gourde isotherme 750 ml", "Gourde inox double paroi, garde le froid 24h et le chaud 12h", 35.0, None, 60, "Sport", "bottle"),
    ("Corde à sauter connectée", "Corde à sauter avec compteur intégré et roulements à billes, câble réglable", 29.0, None, 45, "Sport", "jumprope"),
    ("Vélo d'appartement pliable", "Vélo d'intérieur pliable, 8 niveaux de résistance, écran LCD, silencieux", 389.0, 349.0, 5, "Sport", "bike"),
    ("Sac de sport 35L", "Sac de sport avec compartiment chaussures et poche ventilée", 59.0, None, 25, "Sport", "gymbag"),
    # Beauté & Santé
    ("Sérum vitamine C", "Sérum éclat anti-oxydant à la vitamine C stabilisée, 30 ml, tous types de peau", 42.0, None, 40, "Beauté & Santé", "serum"),
    ("Brosse nettoyante visage", "Brosse sonique en silicone, étanche, 5 vitesses, rechargeable USB", 65.0, None, 20, "Beauté & Santé", "facebrush"),
    ("Coffret soins barbe", "Huile, baume, peigne en bois et ciseaux dans un coffret cadeau", 58.0, None, 18, "Beauté & Santé", "beard"),
    ("Sèche-cheveux ionique", "Sèche-cheveux 2200 W technologie ionique, 3 températures, diffuseur inclus", 119.0, 99.0, 14, "Beauté & Santé", "hairdryer"),
    ("Balance connectée", "Balance impédancemètre bluetooth, 13 mesures corporelles, application dédiée", 79.0, None, 16, "Beauté & Santé", "scale"),
    # Livres & Papeterie
    ("Carnet de notes A5 cuir", "Carnet rechargeable couverture cuir, 200 pages pointillées, marque-page ruban", 32.0, None, 50, "Livres & Papeterie", "notebook"),
    ("Roman « Les Vents du Sud »", "Roman contemporain, prix littéraire 2025, 384 pages", 28.0, None, 40, "Livres & Papeterie", "novel"),
    ("Guide « Cuisiner sain au quotidien »", "80 recettes équilibrées et rapides, photos couleur, conseils nutrition", 36.0, None, 30, "Livres & Papeterie", "cookbook"),
    ("Stylo plume premium", "Stylo plume corps en laiton, plume acier fine, cartouches incluses", 48.0, None, 35, "Livres & Papeterie", "pen"),
    ("Agenda 2026 semainier", "Agenda semainier relié, papier 100 g, rubans marque-pages, pages de notes", 24.0, None, 60, "Livres & Papeterie", "planner"),
]

if db.query(models.Product).count() == 0:
    for idx, (name, desc, price, promo, stock, cat, seed) in enumerate(PRODUCTS):
        db.add(
            models.Product(
                name=name,
                description=desc,
                price=price,
                promo_price=promo,
                stock=stock,
                category_id=cats[cat].id,
                image_url=img(seed),
                created_at=NOW - timedelta(days=random.randint(5, 150)),
            )
        )
    db.commit()
    print(f"{len(PRODUCTS)} produits créés")

products = {p.name: p for p in db.query(models.Product).all()}
by_cat = {}
for p in products.values():
    by_cat.setdefault(p.category.name, []).append(p)

# --------------------------------------------------------------------------- promotions
if db.query(models.Promotion).count() == 0:
    db.add_all(
        [
            models.Promotion(name="Ventes Flash High-Tech", discount_percent=15.0, starts_at=NOW - timedelta(days=3), ends_at=NOW + timedelta(days=12), is_active=True, category_id=cats["Électronique"].id),
            models.Promotion(name="Offre Randonnée & Plein Air", discount_percent=20.0, starts_at=NOW - timedelta(days=1), ends_at=NOW + timedelta(days=7), is_active=True, product_id=products["Sac à dos voyage 40L"].id),
            models.Promotion(name="Semaine Bien-être", discount_percent=10.0, starts_at=NOW - timedelta(days=2), ends_at=NOW + timedelta(days=5), is_active=True, category_id=cats["Beauté & Santé"].id),
            models.Promotion(name="Promo Fin de Saison Sport", discount_percent=25.0, starts_at=NOW + timedelta(days=5), ends_at=NOW + timedelta(days=20), is_active=True, category_id=cats["Sport"].id),
            models.Promotion(name="Rentrée Littéraire (terminée)", discount_percent=10.0, starts_at=NOW - timedelta(days=40), ends_at=NOW - timedelta(days=10), is_active=True, category_id=cats["Livres & Papeterie"].id),
        ]
    )
    db.commit()
    print("5 promotions créées")

# --------------------------------------------------------------------------- personas & commandes
PERSONAS = {
    "client@shop.com": {"cats": ["Électronique", "Sport"], "orders": 5, "activity": 1.0},
    "amine@example.com": {"cats": ["Électronique"], "orders": 4, "activity": 0.9},
    "sarra@example.com": {"cats": ["Mode", "Beauté & Santé"], "orders": 4, "activity": 0.9},
    "yassine@example.com": {"cats": ["Sport"], "orders": 3, "activity": 0.7},
    "nour@example.com": {"cats": ["Maison", "Livres & Papeterie"], "orders": 4, "activity": 0.8},
    "mehdi@example.com": {"cats": ["Électronique", "Maison"], "orders": 3, "activity": 0.7},
    "ines@example.com": {"cats": ["Beauté & Santé", "Mode"], "orders": 3, "activity": 0.8},
    "karim@example.com": {"cats": ["Sport", "Électronique"], "orders": 6, "activity": 1.0},
    "leila@example.com": {"cats": ["Livres & Papeterie", "Maison"], "orders": 2, "activity": 0.6},
    "omar@example.com": {"cats": ["Mode"], "orders": 1, "activity": 0.2, "old": True},
    "rania@example.com": {"cats": ["Beauté & Santé", "Électronique"], "orders": 0, "activity": 0.5},
}
STATUS_BY_AGE = [(3, ["CONFIRMED", "PROCESSING"]), (8, ["PROCESSING", "SHIPPED"]), (15, ["SHIPPED", "DELIVERED"]), (999, ["DELIVERED"])]
CARD_BRANDS = ["Visa", "Mastercard"]


def pick_products(persona, k):
    pool = []
    for cat in persona["cats"]:
        pool.extend(by_cat[cat] * 3)  # affinité forte
    other = [p for p in products.values() if p.category.name not in persona["cats"]]
    pool.extend(other)
    chosen = []
    while len(chosen) < k and pool:
        p = random.choice(pool)
        if p not in chosen:
            chosen.append(p)
    return chosen


def status_for(days_ago):
    for limit, options in STATUS_BY_AGE:
        if days_ago <= limit:
            return random.choice(options)
    return "DELIVERED"


if db.query(models.Order).count() == 0:
    n_orders = 0
    for email, persona in PERSONAS.items():
        user = users[email]
        for k in range(persona["orders"]):
            days_ago = random.randint(75, 90) if persona.get("old") else random.randint(0, 85)
            when = NOW - timedelta(days=days_ago, hours=random.randint(8, 21), minutes=random.randint(0, 59))
            items = pick_products(persona, random.choice([1, 1, 2, 2, 3]))
            status = status_for(days_ago)
            cancelled = random.random() < 0.08 and days_ago > 2
            if cancelled:
                status = "CANCELLED"
            method = "card" if random.random() < 0.7 else "cash_on_delivery"
            total = 0.0
            order = models.Order(
                user_id=user.id,
                status=status,
                payment_method=method,
                payment_status="UNPAID",
                shipping_name=user.full_name,
                shipping_phone=user.phone,
                shipping_address=user.address,
                shipping_city=user.city,
                shipping_postal_code=user.postal_code,
                created_at=when,
            )
            db.add(order)
            db.flush()
            for p in items:
                qty = random.choice([1, 1, 1, 2])
                unit = p.promo_price if p.promo_price is not None else p.price
                total += unit * qty
                db.add(models.OrderItem(order_id=order.id, product_id=p.id, quantity=qty, unit_price=unit))
                # clickstream précédant l'achat (≈ 70 % des achats sont précédés de consultations, le reste = achats impulsifs)
                if random.random() < 0.7:
                    for v in range(random.randint(1, 3)):
                        db.add(models.Interaction(user_id=user.id, product_id=p.id, event_type="view", created_at=when - timedelta(hours=random.randint(1, 240))))
                db.add(models.Interaction(user_id=user.id, product_id=p.id, event_type="add_to_cart", value=float(qty), created_at=when - timedelta(minutes=random.randint(5, 120))))
                if not cancelled:
                    db.add(models.Interaction(user_id=user.id, product_id=p.id, event_type="purchase", value=float(qty), created_at=when))
                    p.stock = max(0, p.stock - qty)
            order.total = round(total, 2)
            # paiement
            if method == "card":
                brand = random.choice(CARD_BRANDS)
                db.add(models.Payment(order_id=order.id, user_id=user.id, method="card", amount=order.total, status="SUCCEEDED", transaction_ref=f"PAY-{when.strftime('%Y%m%d')}-{order.id:04d}{random.randint(10, 99)}", card_brand=brand, card_last4=str(random.randint(1000, 9999)), created_at=when))
                order.payment_status = "PAID"
                order.paid_at = when
            else:
                paid = status == "DELIVERED"
                db.add(models.Payment(order_id=order.id, user_id=user.id, method="cash_on_delivery", amount=order.total, status="SUCCEEDED" if paid else "PENDING", transaction_ref=f"COD-{when.strftime('%Y%m%d')}-{order.id:05d}", created_at=when))
                if paid:
                    order.payment_status = "PAID"
                    order.paid_at = when + timedelta(days=3)
            if cancelled:
                if order.payment_status == "PAID":
                    db.add(models.Payment(order_id=order.id, user_id=user.id, method=method, amount=-order.total, status="REFUNDED", transaction_ref=f"RFD-{when.strftime('%Y%m%d')}-{order.id:04d}", created_at=when + timedelta(days=1)))
                    order.payment_status = "REFUNDED"
                else:
                    order.payment_status = "UNPAID"
            n_orders += 1
    # tentatives de paiement refusées (analyse des échecs)
    for email in ["client@shop.com", "sarra@example.com"]:
        u = users[email]
        db.add(models.Payment(order_id=None, user_id=u.id, method="card", amount=round(random.uniform(60, 300), 2), status="FAILED", transaction_ref=f"DECL-{NOW.strftime('%Y%m%d')}-{random.randint(1000, 9999)}", card_brand="Visa", card_last4="0002", failure_reason="Paiement refusé par la banque : fonds insuffisants.", created_at=NOW - timedelta(days=random.randint(1, 20))))
    db.commit()
    print(f"{n_orders} commandes créées avec paiements simulés et clickstream associé")

# --------------------------------------------------------------------------- navigation, recherches, favoris, paniers
SEARCH_QUERIES = [
    ("écouteurs sans fil", 3), ("cadeau sport moins de 100 dt", 2), ("montre connectée", 4), ("tapis yoga", 2),
    ("machine à café", 2), ("sac à dos", 3), ("chaussures running pas cher", 2), ("lampe bureau", 1),
    ("sérum visage", 2), ("livre cuisine", 1), ("clavier gamer", 1), ("robot aspirateur", 2),
    ("smartphone", 0), ("télévision 4k", 0), ("parfum homme", 0), ("trottinette électrique", 0), ("casque audio", 1),
]
if db.query(models.Interaction).filter(models.Interaction.event_type == "search").count() == 0:
    for email, persona in PERSONAS.items():
        user = users[email]
        # vues de curiosité (sans achat) dans les catégories préférées + quelques hors catégorie, réparties sur 90 jours
        n_views = int(30 * persona["activity"])
        for _ in range(n_views):
            p = random.choice(pick_products(persona, 1))
            db.add(models.Interaction(user_id=user.id, product_id=p.id, event_type="view", created_at=NOW - timedelta(days=random.randint(0, 90), hours=random.randint(0, 23))))
        # favoris
        for p in pick_products(persona, random.randint(1, 3)):
            if db.query(models.WishlistItem).filter_by(user_id=user.id, product_id=p.id).first() is None:
                db.add(models.WishlistItem(user_id=user.id, product_id=p.id, created_at=NOW - timedelta(days=random.randint(0, 20))))
                db.add(models.Interaction(user_id=user.id, product_id=p.id, event_type="wishlist_add", created_at=NOW - timedelta(days=random.randint(0, 20))))
        # recherches
        for _ in range(int(4 * persona["activity"])):
            q, results = random.choice(SEARCH_QUERIES)
            db.add(models.Interaction(user_id=user.id, event_type="search", query=q, value=float(results), created_at=NOW - timedelta(days=random.randint(0, 25), hours=random.randint(0, 23))))
    # visiteurs anonymes
    for s in range(6):
        sid = f"anon-{s:03d}"
        for _ in range(random.randint(2, 5)):
            p = random.choice(list(products.values()))
            db.add(models.Interaction(session_id=sid, product_id=p.id, event_type="view", created_at=NOW - timedelta(days=random.randint(0, 14), hours=random.randint(0, 23))))
        q, results = random.choice(SEARCH_QUERIES)
        db.add(models.Interaction(session_id=sid, event_type="search", query=q, value=float(results), created_at=NOW - timedelta(days=random.randint(0, 14))))
    # paniers abandonnés
    for email, names in {"rania@example.com": ["Sérum vitamine C", "Écouteurs sans fil Pro"], "mehdi@example.com": ["Robot aspirateur connecté"], "yassine@example.com": ["Haltères réglables 2×12 kg", "Gourde isotherme 750 ml"]}.items():
        user = users[email]
        for name in names:
            p = products[name]
            if db.query(models.CartItem).filter_by(user_id=user.id, product_id=p.id).first() is None:
                db.add(models.CartItem(user_id=user.id, product_id=p.id, quantity=1))
                db.add(models.Interaction(user_id=user.id, product_id=p.id, event_type="add_to_cart", value=1.0, created_at=NOW - timedelta(days=random.randint(1, 5))))
    db.commit()
    print("Clickstream créé : vues, recherches, favoris, paniers abandonnés")

# --------------------------------------------------------------------------- avis
REVIEWS = [
    ("Écouteurs sans fil Pro", 5, "Excellente qualité sonore, la réduction de bruit est bluffante et l'autonomie est au rendez-vous !"),
    ("Écouteurs sans fil Pro", 4, "Très bon son, confortables, mais l'étui est un peu fragile."),
    ("Écouteurs sans fil Pro", 2, "Connexion bluetooth instable avec mon téléphone, déçu pour le prix."),
    ("Montre connectée Fit", 4, "Montre très pratique et élégante, autonomie un peu juste."),
    ("Montre connectée Fit", 5, "Suivi du sommeil précis, super rapport qualité prix, je recommande."),
    ("Chargeur rapide 65W USB-C", 5, "Charge ultra rapide, compact et ne chauffe pas. Parfait !"),
    ("Enceinte bluetooth portable", 4, "Basses puissantes pour la taille, parfaite pour la plage."),
    ("Enceinte bluetooth portable", 3, "Son correct mais l'autonomie annoncée n'est pas atteinte."),
    ("Casque audio studio", 5, "Son magnifique et très confortable même après plusieurs heures."),
    ("Batterie externe 20000 mAh", 4, "Recharge mon téléphone 4 fois, un peu lourde mais fiable."),
    ("Clavier mécanique compact", 5, "Frappe agréable, silencieux, rétroéclairage superbe."),
    ("Webcam Full HD 1080p", 2, "Image floue en faible luminosité et le micro grésille, décevant."),
    ("Sac à dos voyage 40L", 2, "La fermeture éclair est un peu fragile et s'est bloquée après 2 jours."),
    ("Sac à dos voyage 40L", 4, "Très pratique en cabine, beaucoup de compartiments, bon rapport qualité prix."),
    ("Veste imperméable", 5, "Très bonne veste imperméable, coupe-vent parfait pour la randonnée."),
    ("Baskets urbaines en cuir", 4, "Jolies et confortables, taille normalement."),
    ("Montre classique acier", 5, "Élégante, finition impeccable, bracelet solide. Un très beau cadeau."),
    ("Lunettes de soleil polarisées", 3, "Correctes mais la monture est un peu grande pour mon visage."),
    ("Écharpe en laine mérinos", 5, "Douce, chaude, ne gratte pas. Parfaite pour l'hiver."),
    ("Lampe de bureau LED", 2, "La luminosité scintille parfois quand je la branche sur secteur."),
    ("Lampe de bureau LED", 4, "Design sympa et lumière agréable pour travailler le soir."),
    ("Set de rangement cuisine", 5, "Hermétiques et pratiques, la cuisine est enfin rangée !"),
    ("Machine à café expresso", 5, "Café excellent, mousse de lait parfaite, très simple à utiliser."),
    ("Machine à café expresso", 3, "Bon café mais la machine est bruyante et le réservoir se retire difficilement."),
    ("Plaid en fausse fourrure", 5, "Ultra doux et chaud, ma fille l'adore."),
    ("Diffuseur d'huiles essentielles", 4, "Silencieux et joli, l'arrêt automatique est pratique."),
    ("Robot aspirateur connecté", 4, "Cartographie efficace, aspire bien, un peu lent sur les tapis épais."),
    ("Baskets running", 4, "Baskets très confortables pour la course à pied, taille parfaitement."),
    ("Baskets running", 5, "Amorti excellent, légères, mes meilleures chaussures de running."),
    ("Tapis de yoga", 3, "Tapis correct mais glisse un peu sur parquet ciré."),
    ("Tapis de yoga", 5, "Épais, confortable, ne bouge pas pendant les séances. Top !"),
    ("Haltères réglables 2×12 kg", 5, "Gain de place énorme, système de réglage rapide et solide."),
    ("Gourde isotherme 750 ml", 5, "Garde l'eau glacée toute la journée, aucune fuite."),
    ("Corde à sauter connectée", 2, "Le compteur se dérègle souvent et le câble s'est cassé au bout d'un mois."),
    ("Vélo d'appartement pliable", 4, "Silencieux et stable, parfait pour un appartement. Montage facile."),
    ("Sac de sport 35L", 4, "Bonne taille, le compartiment chaussures est très pratique."),
    ("Sérum vitamine C", 5, "Teint plus lumineux après deux semaines, texture agréable."),
    ("Sérum vitamine C", 3, "Correct mais l'odeur est un peu forte."),
    ("Brosse nettoyante visage", 4, "Peau plus nette, facile à nettoyer, batterie qui dure longtemps."),
    ("Coffret soins barbe", 5, "Très beau coffret, l'huile sent divinement bon. Cadeau parfait."),
    ("Sèche-cheveux ionique", 4, "Puissant et rapide, un peu bruyant."),
    ("Balance connectée", 2, "Mesures incohérentes d'un jour à l'autre, l'application bug souvent."),
    ("Carnet de notes A5 cuir", 5, "Papier de qualité, le cuir est magnifique, très élégant."),
    ("Roman « Les Vents du Sud »", 5, "Une histoire bouleversante, impossible à lâcher !"),
    ("Guide « Cuisiner sain au quotidien »", 4, "Recettes simples et savoureuses, belles photos."),
    ("Stylo plume premium", 4, "Belle écriture fluide, un peu lourd en main."),
    ("Agenda 2026 semainier", 5, "Bien conçu, papier épais, parfait pour s'organiser."),
]
if db.query(models.Review).count() == 0:
    buyers_by_product = {}
    for o in db.query(models.Order).filter(models.Order.status != "CANCELLED").all():
        for it in o.items:
            buyers_by_product.setdefault(it.product_id, set()).add(o.user_id)
    client_ids = [u.id for u in users.values() if not u.is_admin]
    n = 0
    used = set()
    for name, rating, comment in REVIEWS:
        p = products[name]
        candidates = list(buyers_by_product.get(p.id, set()))
        random.shuffle(candidates)
        uid = next((c for c in candidates if (c, p.id) not in used), None)
        verified = uid is not None
        if uid is None:
            uid = next((c for c in random.sample(client_ids, len(client_ids)) if (c, p.id) not in used), None)
        if uid is None:
            continue
        used.add((uid, p.id))
        sentiment, score = lexicon_sentiment(comment, rating)
        when = NOW - timedelta(days=random.randint(0, 60), hours=random.randint(0, 23))
        db.add(
            models.Review(
                product_id=p.id,
                user_id=uid,
                rating=rating,
                comment=comment,
                sentiment=sentiment,
                sentiment_score=score,
                keywords=json.dumps(extract_aspects(comment), ensure_ascii=False),
                is_verified_purchase=verified,
                created_at=when,
            )
        )
        db.add(models.Interaction(user_id=uid, product_id=p.id, event_type="review", value=float(rating), created_at=when))
        n += 1
    db.commit()
    print(f"{n} avis clients créés avec analyse de sentiment (lexique) et aspects")

# --------------------------------------------------------------------------- conversations chatbot
if db.query(models.ChatMessage).count() == 0:
    samples = [
        ("demo-session-1", users["client@shop.com"].id, [("user", "Bonjour, je cherche des écouteurs sans fil à moins de 200 DT"), ("assistant", "Bonjour ! Les Écouteurs sans fil Pro (189 DT, −15% en ce moment) correspondent à votre budget : réduction de bruit active et 24h d'autonomie.")]),
        ("demo-session-2", users["sarra@example.com"].id, [("user", "Quelles sont les promotions en cours ?"), ("assistant", "Trois offres sont actives : −15% High-Tech, −20% sur le Sac à dos voyage 40L et −10% sur la Beauté & Santé.")]),
        ("demo-session-3", None, [("user", "Un cadeau pour un sportif autour de 50 DT ?"), ("assistant", "La Gourde isotherme 750 ml (35 DT) ou le Tapis de yoga (45 DT) sont des valeurs sûres !")]),
        ("demo-session-4", users["karim@example.com"].id, [("user", "Où en est ma commande ?"), ("assistant", "Votre dernière commande est expédiée et devrait arriver sous 48h.")]),
    ]
    for sid, uid, msgs in samples:
        t = NOW - timedelta(days=random.randint(0, 10))
        for i, (role, content) in enumerate(msgs):
            db.add(models.ChatMessage(user_id=uid, session_id=sid, role=role, content=content, created_at=t + timedelta(seconds=i * 20)))
            if role == "user":
                db.add(models.Interaction(user_id=uid, session_id=sid, event_type="chat", query=content, created_at=t))
    db.commit()
    print("Conversations chatbot de démonstration créées")

db.close()
print("Seed terminé avec succès.")
