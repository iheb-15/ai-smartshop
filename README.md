# NéoShop — Plateforme e-commerce intelligente basée sur l'IA

> **Sujet de PFE** : Conception et développement d'une plateforme e-commerce intelligente basée sur
> l'Intelligence Artificielle pour la personnalisation de l'expérience client.
>
> **Problématique** : comment intégrer des techniques d'IA dans une plateforme e-commerce afin
> d'améliorer l'expérience utilisateur et de faciliter la gestion commerciale ?

Stack : **React 19 / Vite / Tailwind** (frontend) · **FastAPI / SQLAlchemy / SQLite** (backend) ·
**scikit-learn / numpy** (recommandation, prédiction, recherche) · **API Claude (Anthropic)** avec
appels d'outils (chatbot, compréhension des requêtes, analyse des avis).

Toutes les briques IA disposent d'un **mode dégradé** : sans clé `ANTHROPIC_API_KEY`, le chatbot,
la recherche et l'analyse d'avis basculent sur des moteurs à règles / ML local. La plateforme est
donc entièrement démontrable sans clé, et s'améliore automatiquement dès que la clé est ajoutée.

---

## 1. Couverture des objectifs

| Objectif / fonctionnalité | Réalisation |
|---|---|
| Authentification & gestion des utilisateurs | JWT (bcrypt), inscription client, profil + adresse par défaut, changement de mot de passe, admin : recherche, activation/désactivation, promotion admin, fiche client 360° |
| Catalogue produits & catégories | CRUD admin, visibilité (`is_available`), prix promo, notes moyennes, images |
| Recherche multicritère | nom/description, catégorie, prix min/max, stock, tri (prix, note, ventes, nouveauté), pagination |
| Panier | panier serveur, contrôle de stock, ventes croisées « souvent achetés ensemble » |
| Paiement (simulation) | passerelle simulée : contrôle de Luhn, expiration, cartes de test (acceptée / refusée), paiement à la livraison, paiement différé, remboursement à l'annulation, journal des transactions, facture imprimable |
| Gestion des commandes | tunnel de commande 3 étapes, suivi de statut, annulation client (stock restauré + remboursement), back-office : filtres statut/paiement/mode, changement de statut, encaissement COD, export CSV |
| Gestion des promotions | promotions % par produit / catégorie / globales avec fenêtre de dates, meilleur prix appliqué partout |
| Tableau de bord administrateur | KPI, CA par jour (graphiques), statuts, paiements, CA par catégorie, comportement, stocks, meilleurs clients |
| **Recommandation personnalisée** | moteur **hybride** : contenu (TF-IDF) + **filtrage collaboratif item-item** sur matrice implicite (vues, favoris, panier, achats, avis) + affinité de catégorie + popularité + promotions, avec **explication** de chaque recommandation |
| **Chatbot assistant d'achat (LLM)** | Claude avec **appels d'outils** (recherche catalogue, fiche produit, promotions, commandes du client, recommandations, ajout au panier), historique par session, fiches produit dans le chat ; mode dégradé à règles couvrant les mêmes intentions |
| **Recherche intelligente en langage naturel** | compréhension de la requête (LLM en sortie structurée **ou** analyseur à règles FR/EN : budget, fourchette, catégorie, tri, promo, stock) + classement TF-IDF mots + n-grammes de caractères (tolérant aux fautes), affichage de l'interprétation |
| **Analyse des avis clients** | sentiment + score de polarité + **aspects** (prix, qualité, livraison…) par LLM ou lexique avec négation ; synthèse par produit (points forts / faibles) ; achat vérifié ; analytics admin (tendance, produits à surveiller, aspects) |
| **Analyse du comportement des clients** | tracking clickstream (vues, recherches, panier, favoris, achats, chat), entonnoir de conversion, produits vus non achetés, recherches sans résultat, **segmentation RFM**, activité par client |
| **Prédiction des produits susceptibles d'intéresser le client** | modèle supervisé scikit-learn (Gradient Boosting / régression logistique) sur paires (client, produit) construites **temporellement** à chaque commande historique, validation croisée (AUC, balanced accuracy), probabilité + raisons, « next best offer » par client, prévision de rupture de stock |

---

## 2. Architecture

```
ai-smartshop/
├── backend/                      # API FastAPI (http://localhost:8000, docs : /docs)
│   ├── app/
│   │   ├── main.py               # application, CORS, routeurs
│   │   ├── models.py             # User, Category, Product, CartItem, Order, OrderItem, Payment,
│   │   │                         # Review, Promotion, ChatMessage, Interaction, WishlistItem
│   │   ├── schemas.py            # schémas Pydantic
│   │   ├── auth.py               # JWT, dépendances (utilisateur, admin, utilisateur optionnel)
│   │   ├── database.py           # moteur SQLAlchemy + migrations additives
│   │   ├── services/
│   │   │   ├── pricing.py        # meilleur prix (promo manuelle vs promotions actives)
│   │   │   ├── catalog.py        # enrichissement produits, filtre de visibilité
│   │   │   ├── payment.py        # passerelle de paiement simulée (Luhn, cartes de test)
│   │   │   └── tracking.py       # journalisation des événements comportementaux
│   │   ├── ai/
│   │   │   ├── claude_client.py  # client Anthropic, repli de modèle, détection de configuration
│   │   │   ├── text_utils.py     # normalisation FR, stopwords, stemming, analyseur TF-IDF
│   │   │   ├── data.py           # matrice implicite, similarités contenu / item-item (cache)
│   │   │   ├── recommendation.py # moteur hybride + explications + statistiques
│   │   │   ├── interest_prediction.py # modèle de prédiction d'intérêt (features temporelles)
│   │   │   ├── search.py         # intention (LLM / règles) + classement TF-IDF
│   │   │   ├── chatbot.py        # agent Claude à outils + assistant à règles
│   │   │   └── reviews_ai.py     # sentiment, aspects, synthèse produit
│   │   └── routers/              # auth, products, categories, cart, wishlist, orders, reviews,
│   │                             # promotions, dashboard, ai_router, ai_admin, events
│   ├── tests/                    # pytest (38 tests : API, paiement, IA en mode dégradé + LLM simulé)
│   ├── seed.py                   # jeu de données réaliste (--reset pour repartir de zéro)
│   └── requirements.txt
├── frontend/                     # React + Vite + Tailwind + recharts (http://localhost:5173)
│   └── src/
│       ├── context/              # Auth, Cart, Wishlist
│       ├── components/           # ProductCard, ChatWidget, CardForm, Navbar, admin/Charts…
│       ├── pages/                # Home, Shop, ProductDetail, Cart, Checkout, OrderConfirmation,
│       │                         # Invoice, Orders, Profile, Wishlist, Login, Register
│       └── pages/admin/          # Dashboard, Produits, Catégories, Clients (fiche 360°),
│                                 # Commandes, Promotions, Hub IA (4 onglets)
└── docker-compose.yml            # backend + frontend (nginx)
```

### Flux IA (résumé)

```
 Clickstream (vues, recherches, panier, favoris, achats, avis, chat)
        │
        ▼
 interactions ──► data.py : matrice implicite clients × produits
                            similarité contenu (TF-IDF) + item-item (CF, rétrécie)
                                     │                         │
              recommendation.py ◄────┘                         └────► interest_prediction.py
              (hybride + raisons)                                    (GB / LogReg, AUC en CV)
                                     
 Requête client ──► search.py : intention (Claude tool-use | règles) ──► filtres ──► TF-IDF ──► résultats + interprétation
 Message chat  ──► chatbot.py : Claude + outils (search, product, promos, orders, reco, cart) | assistant à règles
 Avis client   ──► reviews_ai.py : sentiment/score/aspects (Claude | lexique) ──► synthèse produit (cache)
```

---

## 3. Lancer le projet

### Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate     # Windows : venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # puis renseigner ANTHROPIC_API_KEY (optionnel)
python seed.py --reset        # crée la base backend/shop.db avec le jeu de données de démo
uvicorn app.main:app --reload --port 8000
```

- Documentation interactive : http://localhost:8000/docs (bouton *Authorize* → `client@shop.com` / `client123`)
- État des briques IA : http://localhost:8000/ai/status

### Frontend

```bash
cd frontend
npm install
cp .env.example .env          # VITE_API_URL=http://localhost:8000
npm run dev                   # http://localhost:5173
```

### Docker (alternative)

```bash
ANTHROPIC_API_KEY=sk-ant-... docker compose up --build
# frontend : http://localhost  — backend : http://localhost:8000
```

### Tests

```bash
cd backend && venv/bin/python -m pytest tests -q      # 38 tests
cd frontend && npm run lint && npm run build
```

---

## 4. Comptes et données de démonstration

| Compte | Identifiants | Profil |
|---|---|---|
| Administrateur | `admin@shop.com` / `admin123` | console admin complète |
| Client démo | `client@shop.com` / `client123` | high-tech + sport, 5 commandes |
| Autres clients | `amine@example.com`, `sarra@…`, `yassine@…`, `nour@…`, `mehdi@…`, `ines@…`, `karim@…`, `leila@…`, `omar@…`, `rania@…` / `client123` | personas aux affinités variées (RFM, prédictions) |

Le seed crée 6 catégories, 37 produits, 5 promotions, ~35 commandes sur 90 jours avec paiements,
~47 avis analysés, un clickstream (vues, recherches, favoris, paniers abandonnés) et des
conversations chatbot.

**Cartes de test (paiement simulé)**

| Numéro | Résultat |
|---|---|
| `4242 4242 4242 4242` | Visa acceptée |
| `5555 5555 5555 4444` | Mastercard acceptée |
| `4000 0000 0000 0002` | refusée — fonds insuffisants |
| `4000 0000 0000 0069` | refusée — carte expirée |
| tout numéro non valide (Luhn) | refusée |

---

## 5. Activer le LLM (clé Anthropic)

1. Renseigner `ANTHROPIC_API_KEY` dans `backend/.env` (et éventuellement `ANTHROPIC_MODEL`).
2. Redémarrer le backend. `GET /ai/status` doit indiquer `llm_configured: true`.
3. Dans le Hub IA (admin), le bouton **« Ré-analyser tous les avis »** relance l'analyse de
   sentiment/aspects par Claude ; les synthèses produit sont régénérées à la demande.

Si le modèle configuré n'est pas disponible pour la clé, le client essaie automatiquement des
modèles de repli (`claude-sonnet-4-5`, `claude-sonnet-4-20250514`, …). Toute erreur d'API
déclenche le mode dégradé correspondant sans interrompre le service.

---

## 6. Principaux endpoints

| Domaine | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/token`, `GET/PUT /auth/me`, `PUT /auth/me/password`, admin `GET/PATCH/DELETE /auth/users…` |
| Catalogue | `GET /products/` (filtres, tri, pagination `X-Total-Count`), `GET /products/{id}`, `GET /categories/`, admin CRUD |
| Panier / favoris | `GET/POST/PUT/DELETE /cart/…`, `GET /wishlist/`, `POST /wishlist/{product_id}` |
| Commandes & paiement | `GET /orders/checkout/preview`, `POST /orders/checkout`, `POST /orders/{id}/pay`, `POST /orders/{id}/cancel`, `GET /orders/{id}` (facture), admin `GET /orders/all`, `PUT /orders/{id}/status`, `PUT /orders/{id}/payment-status` |
| Avis | `GET /reviews/product/{id}`, `GET /reviews/product/{id}/summary`, `POST /reviews/`, admin `GET /reviews/all`, `POST /reviews/reanalyze` |
| IA client | `POST /ai/search`, `GET /ai/recommendations/{for-me,popular,similar/{id},bought-together/{id}}`, `GET /ai/predictions/for-me`, `POST /ai/chat`, `GET /ai/chat/history`, `GET /ai/status` |
| Tracking | `POST /events/`, `GET /events/recently-viewed` |
| Admin décisionnel | `GET /dashboard/stats`, exports CSV, `GET /ai-admin/{reviews-analytics,customer-behavior,recommendations-stats,predictions}`, `GET /ai-admin/predictions/{model,overview,customer/{id}}`, `POST /ai-admin/predictions/retrain`, `GET /ai-admin/customers/{id}/activity` |

---

## 7. Choix de conception notables

- **Prédiction sans fuite d'information** : les variables d'une paire (client, produit) sont
  calculées uniquement à partir des événements antérieurs à la commande qui sert d'étiquette
  (leave-future-out). Les produits déjà achetés ou présents dans le panier sont exclus des
  candidats en production.
- **Recommandations explicables** : chaque suggestion porte la composante dominante
  (« Similaire à … que vous avez acheté », « Les clients ayant aimé … », « Dans votre catégorie préférée »).
- **Paiement simulé mais réaliste** : validation formelle de la carte, refus déterministes, journal
  `payments` (SUCCEEDED / FAILED / PENDING / REFUNDED / CANCELLED), un refus ne crée jamais de commande.
- **Robustesse** : chaque appel LLM est encapsulé (repli de modèle, repli fonctionnel) ; les caches
  ML (matrices, modèle) sont invalidés par signature des données.
- **Sécurité** : l'inscription publique ne crée jamais d'administrateur ; produits masqués invisibles
  côté client ; un client ne voit que ses commandes ; auto-protection des comptes admin.
