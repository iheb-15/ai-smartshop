"""Script pour peupler la base avec des données de démo.
Lancer depuis backend/ : python seed.py
"""
from app.database import SessionLocal, engine, Base
from app import models
from app.auth import hash_password

Base.metadata.create_all(bind=engine)
db = SessionLocal()

demo_users = [
    ("Admin", "admin@shop.com", "admin123", True),
    ("Client Démo", "client@shop.com", "client123", False),
]
created_users = []
for full_name, email, password, is_admin in demo_users:
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        db.add(
            models.User(
                full_name=full_name,
                email=email,
                hashed_password=hash_password(password),
                is_admin=is_admin,
            )
        )
        created_users.append(email)

if created_users:
    db.commit()
    print("Utilisateurs créés : admin@shop.com / admin123, client@shop.com / client123")

if db.query(models.Category).count() == 0:
    categories = [
        models.Category(name="Électronique", description="Gadgets, accessoires et high-tech"),
        models.Category(name="Mode", description="Vêtements et accessoires"),
        models.Category(name="Maison", description="Décoration et équipement pour la maison"),
        models.Category(name="Sport", description="Équipements et vêtements de sport"),
    ]
    db.add_all(categories)
    db.commit()
    print(f"{len(categories)} catégories créées")

cats = {c.name: c for c in db.query(models.Category).all()}

if db.query(models.Product).count() == 0:
    products = [
        models.Product(name="Écouteurs sans fil Pro", description="Écouteurs bluetooth avec réduction de bruit active, autonomie 24h", price=189.0, stock=25, category_id=cats["Électronique"].id, image_url="https://picsum.photos/seed/earbuds/400"),
        models.Product(name="Montre connectée Fit", description="Suivi cardio, sommeil, notifications, étanche", price=249.0, promo_price=199.0, stock=15, category_id=cats["Électronique"].id, image_url="https://picsum.photos/seed/watch/400"),
        models.Product(name="Chargeur rapide 65W", description="Chargeur USB-C compact pour laptop et smartphone", price=59.0, stock=40, category_id=cats["Électronique"].id, image_url="https://picsum.photos/seed/charger/400"),
        models.Product(name="Sac à dos voyage 40L", description="Sac à dos léger et résistant pour voyager en cabine, plusieurs compartiments", price=129.0, stock=18, category_id=cats["Mode"].id, image_url="https://picsum.photos/seed/backpack/400"),
        models.Product(name="Veste imperméable", description="Veste légère coupe-vent et imperméable pour l'extérieur", price=99.0, stock=22, category_id=cats["Mode"].id, image_url="https://picsum.photos/seed/jacket/400"),
        models.Product(name="Baskets running", description="Chaussures de running légères, amorti confortable", price=139.0, stock=30, category_id=cats["Sport"].id, image_url="https://picsum.photos/seed/shoes/400"),
        models.Product(name="Tapis de yoga", description="Tapis antidérapant épais pour yoga et fitness", price=45.0, stock=50, category_id=cats["Sport"].id, image_url="https://picsum.photos/seed/yoga/400"),
        models.Product(name="Lampe de bureau LED", description="Lampe design réglable avec plusieurs modes de luminosité", price=69.0, stock=20, category_id=cats["Maison"].id, image_url="https://picsum.photos/seed/lamp/400"),
        models.Product(name="Set de rangement cuisine", description="Boîtes de rangement hermétiques pour cuisine, lot de 6", price=39.0, stock=35, category_id=cats["Maison"].id, image_url="https://picsum.photos/seed/kitchen/400"),
        models.Product(name="Enceinte bluetooth portable", description="Enceinte compacte étanche avec basses puissantes, 12h d'autonomie", price=79.0, stock=28, category_id=cats["Électronique"].id, image_url="https://picsum.photos/seed/speaker/400"),
    ]
    db.add_all(products)
    db.commit()
    print(f"{len(products)} produits créés")

# Seed sample reviews if empty
if db.query(models.Review).count() == 0:
    all_products = db.query(models.Product).all()
    demo_client = db.query(models.User).filter(models.User.email == "client@shop.com").first()
    if demo_client and all_products:
        reviews_data = [
            (all_products[0].id, 5, "Excellente qualité sonore, la réduction de bruit est bluffante !", "positive"),
            (all_products[1].id, 4, "Montre très pratique et élégante, autonomie un peu juste.", "neutral"),
            (all_products[2].id, 5, "Charge ultra rapide, compact et ne chauffe pas. Parfait !", "positive"),
            (all_products[3].id, 2, "La fermeture éclair est un peu fragile et s'est bloquée après 2 jours.", "negative"),
            (all_products[4].id, 5, "Très bonne veste imperméable, coupe-vent parfait pour la randonnée.", "positive"),
            (all_products[5].id, 4, "Baskets très confortables pour la course à pied, taille parfaitement.", "positive"),
            (all_products[6].id, 3, "Tapis correct mais glisse un peu sur parquet ciré.", "neutral"),
            (all_products[7].id, 2, "La luminosité scintille parfois quand je la branche sur secteur.", "negative"),
        ]
        for pid, rating, comment, sentiment in reviews_data:
            db.add(models.Review(
                product_id=pid,
                user_id=demo_client.id,
                rating=rating,
                comment=comment,
                sentiment=sentiment,
            ))
        db.commit()
        print(f"{len(reviews_data)} avis clients créés avec analyse de sentiment")

# Seed sample promotions if empty
if db.query(models.Promotion).count() == 0:
    all_products = db.query(models.Product).all()
    all_categories = db.query(models.Category).all()
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    promos = [
        models.Promotion(
            name="Ventes Flash High-Tech",
            discount_percent=20.0,
            starts_at=now - timedelta(days=2),
            ends_at=now + timedelta(days=10),
            is_active=True,
            category_id=all_categories[0].id if all_categories else None,
        ),
        models.Promotion(
            name="Offre Randonnée & Plein Air",
            discount_percent=15.0,
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=7),
            is_active=True,
            product_id=all_products[3].id if len(all_products) > 3 else None,
        ),
        models.Promotion(
            name="Promo Fin de Saison Sport",
            discount_percent=25.0,
            starts_at=now + timedelta(days=5),
            ends_at=now + timedelta(days=20),
            is_active=True,
            category_id=all_categories[3].id if len(all_categories) > 3 else None,
        ),
    ]
    db.add_all(promos)
    db.commit()
    print(f"{len(promos)} promotions créées")

# Seed sample orders if few
if db.query(models.Order).count() < 5:
    all_products = db.query(models.Product).all()
    demo_client = db.query(models.User).filter(models.User.email == "client@shop.com").first()
    if demo_client and len(all_products) >= 4:
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        order_specs = [
            (
                "DELIVERED",
                now - timedelta(days=6),
                [(all_products[0], 1), (all_products[2], 1)],
            ),
            (
                "SHIPPED",
                now - timedelta(days=4),
                [(all_products[1], 1)],
            ),
            (
                "PROCESSING",
                now - timedelta(days=2),
                [(all_products[3], 1), (all_products[4], 1)],
            ),
            (
                "CONFIRMED",
                now - timedelta(days=1),
                [(all_products[5], 2), (all_products[6], 1)],
            ),
            (
                "PENDING",
                now,
                [(all_products[0], 1), (all_products[1], 1)],
            ),
        ]

        for status, date, items in order_specs:
            total = sum((p.promo_price or p.price) * qty for p, qty in items)
            order = models.Order(
                user_id=demo_client.id,
                status=status,
                total=round(total, 2),
                created_at=date,
            )
            db.add(order)
            db.flush()
            for p, qty in items:
                db.add(models.OrderItem(
                    order_id=order.id,
                    product_id=p.id,
                    quantity=qty,
                    unit_price=p.promo_price or p.price,
                ))
        db.commit()
        print(f"{len(order_specs)} commandes de démonstration créées avec historique")

db.close()
print("Seed terminé avec succès.")

