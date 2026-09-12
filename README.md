# Plateforme E-commerce Intelligente (IA)

Projet full-stack : **React (frontend)** + **FastAPI / Python (backend)** + **SQLite**,
avec intégration réelle de l'API Claude (Anthropic) pour :
- un chatbot assistant d'achat (RAG léger sur le catalogue)
- l'analyse de sentiment des avis clients

Et des algorithmes de ML classiques (scikit-learn, sans coût API) pour :
- la recherche intelligente en langage naturel (TF-IDF + similarité cosinus)
- les recommandations de produits (similaires + "souvent achetés ensemble" + personnalisées)

## Structure

```
ecommerce-ai/
├── backend/          # API FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── auth.py
│   │   ├── routers/       # auth, products, categories, cart, orders, ai_router, reviews, dashboard
│   │   └── ai/             # recommendation.py, search.py, chatbot.py, reviews_ai.py, claude_client.py
│   ├── seed.py             # peuple la BDD avec des données de démo
│   └── requirements.txt
└── frontend/          # App React (Vite + Tailwind)
    └── src/
        ├── api/, context/, components/, pages/
```

## Lancer le backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Édite .env et mets ta vraie clé ANTHROPIC_API_KEY (nécessaire pour le chatbot
# et l'analyse de sentiment ; le reste de l'app fonctionne sans)
python seed.py                  # crée la BDD + données de démo
uvicorn app.main:app --reload   # http://localhost:8000
```

Comptes de démo créés par `seed.py` :
- Admin : `admin@shop.com` / `admin123`
- Client : `client@shop.com` / `client123`

Documentation interactive de l'API : http://localhost:8000/docs

## Lancer le frontend

```bash
cd frontend
npm install
cp .env.example .env    # VITE_API_URL=http://localhost:8000
npm run dev              # http://localhost:5173
```

## Fonctionnalités implémentées

**Partie e-commerce**
- Authentification (inscription/connexion, JWT), rôle admin
- Catalogue produits + catégories, recherche multicritère (nom, prix, catégorie, stock)
- Panier, checkout simulé (décrémente le stock, crée une commande)
- Gestion des commandes (historique client, changement de statut admin)
- Gestion des promotions (prix promo par produit)
- Tableau de bord admin (CA, commandes, top produits, alertes stock faible, création/suppression produits)

**Partie IA**
- Recommandation personnalisée (produits similaires par TF-IDF, "souvent achetés ensemble" par co-achat, suggestions par catégorie pour un utilisateur connecté)
- Chatbot assistant d'achat alimenté par l'API Claude, avec contexte catalogue injecté dynamiquement (widget flottant sur toutes les pages)
- Recherche intelligente en langage naturel (ex. "sac léger pour voyager pas cher")
- Analyse de sentiment des avis clients via l'API Claude (positif/neutre/négatif, visible sur chaque avis et agrégé dans le dashboard)

## Pistes d'amélioration (pour aller plus loin dans le PFE)

- Remplacer TF-IDF par des embeddings vectoriels (ex. via une base vectorielle) pour une recherche sémantique plus fine
- Ajouter un vrai module de "prédiction des produits susceptibles d'intéresser le client" avec un modèle collaboratif plus poussé (matrix factorization)
- Passer la BDD en PostgreSQL pour la prod
- Ajouter des tests automatisés (pytest côté backend, vitest côté frontend)
- Déploiement (Docker Compose, CI/CD)
