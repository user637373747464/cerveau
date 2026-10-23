# Cerveau — mon deuxième cerveau en 3D

Une appli pour iPhone : tes notes sont des sommets dans une carte 3D que tu construis toi‑même.

## Mettre l'appli sur ton iPhone (GitHub Pages)

1. Sur github.com, crée un **nouveau dépôt** (bouton « New »), nom : `cerveau`, public.
2. Dans ce dépôt : **Add file → Upload files**, puis glisse **tout le contenu** du dossier décompressé
   (les fichiers **et** les dossiers `icons` et `vendor`) → **Commit changes**.
3. **Settings → Pages** → « Deploy from a branch » → branche `main`, dossier `/ (root)` → **Save**.
4. Attends 2 minutes. L'adresse sera : `https://mathematicien100frontieres.github.io/cerveau/`
5. Ouvre‑la dans **Safari** sur l'iPhone → bouton Partager → **Sur l'écran d'accueil**.
   **Utilise toujours l'icône de l'écran d'accueil** : c'est elle qui garde tes notes de façon durable.

## Important : tes données

Tout reste dans l'iPhone (rien n'est envoyé sur Internet). Safari peut effacer les données d'un site
qu'on n'a pas ajouté à l'écran d'accueil. Dans **Réglages → Sauvegarder**, fais une copie de temps en temps
(un fichier `.cerveau` que tu peux ranger dans Fichiers ou iCloud). **Restaurer** la remet en place.

## Utilisation

- **Carte** : un doigt = tourner, deux doigts = zoom + déplacement. Toucher un sommet = le choisir (la caméra glisse vers lui),
  toucher deux fois = ouvrir sa note. Un sommet choisi se déplace en le glissant (il reste alors fixe).
- Boutons du sommet choisi : **Ouvrir**, **+ Enfant** (crée un sommet relié), **Relier à…**, **Aspect** (forme et couleur),
  **Fixer/Libérer**, **Supprimer**.
- **Loupe** : cherche un mot ou un `#tag` ; les sommets qui correspondent brillent sur la carte.
- **Note** : titre, tags, texte libre. Barre d'outils : Titre / Sous‑titre, gras, italique, souligné, barré, taille, couleur du texte,
  surlignage (avec **ton code couleur**, modifiable), listes, cases à cocher, citation, lien (YouTube = vignette), pièces jointes
  (photo, vidéo, PDF, autre fichier), formule.
- **Formules** : écris `$$ \int_a^b f(x)\,dx $$` (ou `$x^2$` en ligne) sur **une même ligne**, puis touche l'œil (lecture) pour les voir.
- **Notes** : liste de tous les sommets, filtre par tag, bouton **Aujourd'hui** (note de la journée).

## Pour les curieux

HTML + JavaScript, aucune bibliothèque externe sauf KaTeX (formules, dans `vendor/`). La 3D est dessinée par `carte.js`.
Stockage : IndexedDB. Fonctionne hors‑ligne après la première ouverture.

## Nouveautés (v2)

- **Taille d'un sommet** : Petit / Moyen / Grand, dans « Forme et couleur » (à côté de la forme et de la couleur).
- **Liens sans clavier** : 🔗 → « Coller le lien » (copie ton lien avant, iOS te demande de confirmer le collage).
- **Vidéo / lien / fichier** : s'insère là où se trouve ton curseur (plus en haut de la page).
- **Liens entre pages** : dans une note, tape `[[` → liste de tes sommets (ou « Créer la page… », qui la crée et la relie sur la carte). Le mot apparaît surligné en bleu ; touche-le pour aller sur la page, « ‹ » pour revenir. `[[Despote]]` tapé en entier marche aussi.
- **Clavier ouvert** : les tags disparaissent et l'en-tête se réduit pour laisser plus de place au texte. Le bouton « œil » passe en lecture sans clavier.

Pour mettre à jour : remplace les fichiers dans ton dépôt, puis ferme et rouvre l'appli deux fois. Tes notes ne bougent pas.

## Nouveautés (v4)

- **Journal** (nouvel onglet) : une page **vierge** par jour, tu y mets ce que tu veux (texte, photos, corrections d'exos, liens…). Calendrier du mois avec un point sur les jours écrits (point bleu = il y a des photos). « Écrire aujourd'hui » ouvre la page du jour. **Aucun rappel, aucune notification.** Un jour que tu ouvres puis refermes sans rien écrire ne laisse aucune trace.
- **Photos de la pellicule** : bouton 📷 dans la barre d'outils d'une page (plusieurs photos d'un coup). L'appli en garde **sa propre copie** : supprimer la photo de ta galerie ne la supprime pas de Cerveau (elles ne disparaissent que si tu effaces l'icône de l'écran d'accueil ou les données du site, d'où la sauvegarde).
- **Les jours sont aussi des sommets de la carte** : petits anneaux dorés avec le numéro du jour, rangés par date (un anneau par mois). Dans une page de jour, écris `[[État]]` : le jour est relié à la page « État », et celle-ci affiche « Mentionné dans : Vendredi 23 octobre » en haut. Le bouton 📅 de la carte (ou Réglages) montre/cache les jours.
- **Orbites** : les enfants d'un sommet (créés avec « + Enfant ») se placent sur un cercle autour de leur parent, tous à la même distance et bien espacés ; si un enfant a lui-même des enfants, le cercle s'agrandit automatiquement pour que les branches ne se chevauchent pas. Si tu déplaces un enfant à la main il reste où tu le poses ; « Sur l'orbite » le remet en place, « Ranger ses enfants » remet tous les enfants d'un sommet, « Tout remettre sur les orbites » (Réglages) fait toute la carte. « Relier à… » reste un simple lien, sans orbite. Interrupteur « Orbites » dans Réglages pour revenir à l'ancienne disposition libre.
- **Tailles** : 5 (très petit, petit, moyen, grand, très grand). **Couleurs** : 24 couleurs + la pastille arc-en-ciel « + » pour choisir n'importe quelle couleur (elle est ensuite gardée dans ta liste).
- **Sauvegarde complète** : un seul fichier `.cerveau` avec toutes les pages, tous les liens, les orbites/réglages, le code couleur **et toutes les photos/fichiers**. Bouton « Sauvegarder » dans Journal et dans Réglages (qui affiche la date de la dernière sauvegarde). « Restaurer » remet tout.

Pour mettre à jour : remplace les fichiers dans ton dépôt, puis ferme et rouvre l'appli deux fois. Tes notes et photos ne bougent pas.
