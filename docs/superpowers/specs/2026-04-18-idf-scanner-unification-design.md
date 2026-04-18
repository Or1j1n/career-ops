# Design de Réconciliation IDF et Scanner Unifié

## Contexte

Le dépôt local `career-ops` a été réaligné avec le dépôt amont `santifer/career-ops`, puis poussé vers le fork personnel. Cette mise à jour a révélé un écart structurel normal entre les fichiers système auto-mis à jour et les fichiers utilisateur qui ne le sont jamais, notamment `portals.yml`, `config/profile.yml` et `modes/_profile.md`.

Le sujet principal n'est pas un simple diff entre templates et fichiers personnalisés. Le vrai problème est fonctionnel :

- `portals.yml` contient aujourd'hui des sociétés prioritaires pour l'utilisateur en Île-de-France
- `scan.mjs` ne traite réellement que les sources détectables via `Greenhouse`, `Ashby`, `Lever` ou un champ `api`
- plusieurs entrées `scan_method: websearch` donnent une impression de couverture qui n'existe pas réellement
- `search_queries` n'est pas utilisé par `scan.mjs`

L'objectif n'est donc pas de recopier massivement les templates amont. Il faut conserver une configuration strictement orientée IDF, tout en faisant évoluer le scanner pour qu'il couvre réellement les sociétés stratégiques.

## Objectifs

- Conserver `portals.yml` comme source de vérité utilisateur pour les cibles IDF.
- Introduire un scanner unifié à commande unique via `node scan.mjs`.
- Permettre à `portals.yml` de déclarer explicitement une méthode de scan par société.
- Couvrir réellement les sociétés prioritaires v1, même quand elles ne sont pas exposées via un ATS API simple.
- Ajouter un filtrage géographique strict Île-de-France.
- Réduire l'écart avec l'amont uniquement sur les éléments utiles au cas d'usage IDF.

## Hors périmètre

- Repartir du `templates/portals.example.yml` complet.
- Ajouter tout le catalogue amont de sociétés et de requêtes.
- Concevoir un framework générique d'adapters pour tous les portails du marché.
- Refaire l'ensemble du profil utilisateur dans `config/profile.yml`.
- Introduire une "watchlist manuelle" comme solution principale pour les sociétés prioritaires.

## Décisions de design

### 1. `portals.yml` reste ciblé IDF

Le fichier utilisateur `portals.yml` reste la base. Il n'est pas remplacé par le template amont. La réconciliation suit une logique hybride stricte :

- garder les sociétés et les filtres alignés avec le positionnement Paris / Île-de-France
- ne backporter que les structures ou entrées réellement utiles
- éviter toute dilution du périmètre vers des offres "France", "EMEA" ou "Remote" trop larges

### 2. `scan.mjs` devient le seul point d'entrée

Le scanner unifié reste lancé via :

```bash
node scan.mjs
```

Il absorbe les cas d'usage aujourd'hui éparpillés entre le scan API existant et le prototype `scan-portals.mjs`.

`scan-portals.mjs` est explicitement déprécié puis supprimé.

Raison :

- le prototype contient des chemins hardcodés incompatibles avec le flux officiel
- il contient déjà au moins un bug de reporting sur le total des jobs trouvés
- il ne doit pas devenir une seconde implémentation concurrente du scan

Toute logique Playwright utile doit être réécrite proprement dans `scan.mjs` ou dans des modules dédiés, sans copie directe du prototype.

### 3. Méthodes de scan explicites par société

Chaque société dans `portals.yml` peut déclarer explicitement sa méthode. Le scanner supporte trois classes de méthodes :

- `api`
  Utilise `api` explicite ou détection ATS compatible (`Greenhouse`, `Ashby`, `Lever`)
- `playwright_generic`
  Ouvre la page carrière avec Playwright et tente une extraction générique de liens/offres
- `playwright_custom`
  Utilise un adaptateur spécifique nommé pour les sites à DOM complexe ou fortement dynamiques

Exemple de direction de structure :

```yml
- name: OpenAI (Paris)
  careers_url: https://openai.com/careers
  scan_method: playwright_generic
  enabled: true

- name: Microsoft (Paris)
  careers_url: https://careers.microsoft.com/
  scan_method: playwright_custom
  scan_adapter: microsoft
  enabled: true
```

### 3.1 Contrat des adapters `playwright_custom`

Les adapters custom doivent avoir un contrat explicite dès la spec.

Convention de chemin :

```text
adapters/{scan_adapter}.mjs
```

Export attendu :

```js
export async function scan(page, company) {
  return [
    {
      title,
      url,
      company,
      location,
    },
  ];
}
```

Règles :

- `page` est une page Playwright déjà créée par `scan.mjs`
- `company` est l'objet société issu de `portals.yml`
- l'adapter retourne une liste d'objets normalisables sans écrire de fichier
- `scan.mjs` ajoute ensuite `source` et applique filtres et déduplication

Chargement :

- `scan.mjs` charge dynamiquement l'adapter via `import()`
- si `scan_adapter` est manquant ou introuvable pour une société `playwright_custom`, la société est marquée en erreur mais le scan global continue

La logique reste tolérante :

- une société en échec ne casse pas le scan global
- les résultats de chaque méthode sont normalisés dans un même format

### 4. Format normalisé des résultats

Toutes les méthodes de scan doivent produire des objets homogènes :

```js
{
  title: string,
  url: string,
  company: string,
  location: string,
  source: string
}
```

Cela permet de conserver une seule chaîne de traitement pour :

- `title_filter`
- `location_filter`
- déduplication
- écriture dans `pipeline.md`
- écriture dans `scan-history.tsv`

### 5. Filtre géographique strict Île-de-France

Le `location_filter` ne doit plus se reposer sur les valeurs implicites larges du script.

Un filtre explicite doit être ajouté à `portals.yml`, couvrant :

- la région : `Paris`, `Île-de-France`, `Ile-de-France`, `IDF`, `Grand Paris`, `Paris area`, `Greater Paris`
- les huit départements : `Paris`, `Seine-et-Marne`, `Yvelines`, `Essonne`, `Hauts-de-Seine`, `Seine-Saint-Denis`, `Val-de-Marne`, `Val-d'Oise`
- les appellations opérationnelles courantes comme `La Défense`

Le comportement de fallback doit être strictement défini.

Le code actuel contient un fallback permissif incluant `france`, `emea` et `remote`. Ce comportement est incompatible avec un mode IDF strict.

Décision retenue :

- `scan.mjs` refuse de démarrer si `location_filter` est absent ou vide dans `portals.yml`
- il n'existe plus de fallback permissif implicite
- si un fallback reste nécessaire pour la robustesse du code, il doit être limité aux seuls libellés IDF et produire un avertissement explicite

Le filtre doit accepter les libellés IDF usuels et rejeter les localisations non-IDF ou trop vagues comme :

- `Lyon`
- `Marseille`
- `EMEA`
- `France` seul
- `Remote` seul

### 6. Périmètre v1

#### Groupe A, déjà bien couvertes

Ces sociétés restent dans le socle stable du scan via API ou ATS détectable :

- `Mistral AI`
- `H (Holistic AI)`
- `Dust`
- `Poolside`
- `Shift Technology`
- `Alan`
- `Gladia`
- `Giskard`
- `Dataiku`
- `Anthropic (Paris)`
- `Cohere (Paris)`
- `Palantir (Paris)`

Vérification effectuée avant plan :

- chaque société du Groupe A est bien présente dans `portals.yml`
- chaque société du Groupe A est bien détectable aujourd'hui par `detectApi()`
- aucune société du Groupe A n'est silencieusement skippée par le mécanisme actuel de détection API

#### Groupe B, prioritaires must-check à couvrir dans v1

Ces sociétés doivent être réellement scannées dans la première version unifiée :

- `OpenAI (Paris)`
- `Microsoft (Paris)`
- `AWS (Amazon Paris)`
- `Google Cloud (Paris)`
- `Salesforce (Paris)`
- `Meta (Paris)`
- `Scaleway`
- `S3NS`
- `Illuin`

Méthode initiale recommandée :

- `playwright_custom` dès v1 pour `Microsoft`, `AWS`, `Google Cloud`, `Salesforce`, `Meta`
- `playwright_generic` d'abord pour `OpenAI`, `Scaleway`, `S3NS`, `Illuin`
- bascule vers `playwright_custom` uniquement si le scan générique s'avère insuffisant

### 7. Position sur `search_queries`

`search_queries` ne doit pas devenir le coeur du scanner v1.

Raison :

- le flux principal doit reposer sur des cibles explicites et contrôlées
- les requêtes de recherche sont plus bruitées et plus fragiles
- le besoin prioritaire de l'utilisateur est de couvrir un ensemble de sociétés must-check, pas d'ouvrir un scan large

Les `search_queries` peuvent rester comme mécanisme secondaire ou futur, mais ne sont pas nécessaires pour atteindre les objectifs v1.

## Impact sur les autres fichiers utilisateur

### `config/profile.yml`

Pas de refonte prévue.

Le fichier est déjà structurellement cohérent avec le template amont. Aucune migration fonctionnelle importante n'est requise dans cette phase.

### `modes/_profile.md`

Le contenu personnalisé actuel reste la base. On ne remplace pas le framing spécifique utilisateur par le template générique.

Seules quelques rubriques utiles peuvent être réintroduites si elles améliorent le comportement du système sans diluer le positionnement :

- `Negotiation Scripts`
- `Location Policy`
- éventuellement une courte rubrique `Portfolio / Demo`

Cette consolidation reste secondaire par rapport au chantier scanner.

## Architecture cible de `scan.mjs`

Le flux cible est le suivant :

1. Charger `portals.yml`
2. Construire `title_filter` et `location_filter`
3. Construire les ensembles de déduplication existants
4. Pour chaque société activée :
   - choisir la méthode de scan
   - exécuter l'extraction adaptée
   - normaliser les résultats
   - appliquer les filtres
   - appliquer la déduplication
5. Écrire les nouvelles offres dans `pipeline.md`
6. Écrire l'historique dans `scan-history.tsv`
7. Produire un résumé clair des résultats et des erreurs

Les adapters Playwright custom doivent rester petits et ciblés. Il faut éviter un design trop ambitieux de type framework général, tout en gardant une séparation nette entre :

- sélection de méthode
- extraction
- normalisation
- filtres
- persistance

### Concurrence

La concurrence ne doit pas être identique entre les appels API et les scans Playwright.

Décision retenue :

- les appels API peuvent conserver une concurrence haute
- les scans Playwright utilisent une concurrence dédiée `PLAYWRIGHT_CONCURRENCY`
- la valeur cible de `PLAYWRIGHT_CONCURRENCY` doit être faible, recommandée à `2` avec plafond pratique à `3`

Cela limite :

- la pression sur Chromium
- les timeouts sur des pages lourdes
- les comportements non déterministes sur des sites fortement dynamiques

### `--dry-run`

Le mode `--dry-run` exécute réellement les méthodes de scan, y compris Playwright, mais n'écrit aucun fichier.

Raison :

- il doit permettre de valider l'extraction réelle
- il doit aussi tester les adapters custom et le filtrage géographique
- un `--dry-run` qui saute Playwright masquerait les erreurs d'implémentation sur les sociétés prioritaires

En `--dry-run` :

- le navigateur peut s'exécuter
- les extractions sont réalisées
- la déduplication et les filtres sont appliqués
- aucune écriture n'a lieu dans `pipeline.md` ou `scan-history.tsv`

## Stratégie de tests

### Tests unitaires

- sélection de méthode par société :
  - `api`
  - `playwright_generic`
  - `playwright_custom`
- `location_filter` IDF :
  - accepte les libellés IDF usuels
  - rejette les localisations non IDF
- normalisation des offres :
  - produit le format commun attendu
- déduplication :
  - URL déjà dans `scan-history.tsv`
  - URL déjà dans `pipeline.md`
  - couple `company + role` déjà présent dans `applications.md`

### Tests d'intégration

En `--dry-run`, sur un petit sous-ensemble de sociétés :

- au moins une société `api`
- au moins une société `playwright_generic`
- au moins une société `playwright_custom`

### Vérifications projet

- `node --check scan.mjs`
- `npm run verify`

## Critères d'acceptation

- `scan.mjs` reste l'unique commande de scan à lancer.
- `portals.yml` peut déclarer explicitement une méthode de scan par société.
- Les sociétés prioritaires v1 sont réellement prises en charge :
  - `OpenAI (Paris)`
  - `Microsoft (Paris)`
  - `AWS (Amazon Paris)`
  - `Google Cloud (Paris)`
  - `Salesforce (Paris)`
  - `Meta (Paris)`
  - `Scaleway`
  - `S3NS`
  - `Illuin`
- Le filtre géographique est strictement IDF.
- Le scan continue même si certaines sociétés échouent.
- La sortie reste compatible avec `pipeline.md` et `scan-history.tsv`.
- `npm run verify` reste vert après les changements.
- Le système ne donne plus l'illusion qu'une société est scannée alors qu'elle ne l'est pas.

## Choix retenu

Le design retenu est une réconciliation hybride stricte IDF :

- conserver la personnalisation utilisateur
- rapprocher la structure uniquement là où cela améliore réellement le comportement
- faire évoluer le scanner pour correspondre à la promesse de la configuration

Ce choix privilégie la fiabilité et la lisibilité opérationnelle plutôt qu'une synchronisation superficielle avec tous les templates amont.
