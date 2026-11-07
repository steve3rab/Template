# Typographie locale

L'interface utilise une pile de polices système sans requête réseau : Avenir Next, Segoe UI, Arial et Georgia/Baskerville pour les titres éditoriaux. Les polices réellement disponibles dépendent du système du visiteur. Aucune police distante (Google Fonts ou autre CDN) n'est chargée.

Pour conserver une distribution sans dépendance externe, ne pas ajouter de `@import` vers un fournisseur de polices tiers. Si des fichiers de polices sont ajoutés ultérieurement, conserver leur licence dans ce dossier et les servir depuis cette même origine.
