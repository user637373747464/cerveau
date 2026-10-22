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
