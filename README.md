# 🕹️ PETIT JUEGO — version écran

Le laptop est posé sur la table, tout le monde regarde l'écran, et **chaque téléphone devient une manette** en scannant un QR code. Même esprit, mêmes **20 mini-jeux**, mêmes ambiances et mêmes questions que la [version téléphone](https://github.com/ske-media/petitjuegooo), mais en mode « jeu télé » : les votes secrets se font sur son propre téléphone, les révélations sur le grand écran.

## Comment ça marche

1. Ouvrir `index.html` sur le laptop (ou la version hébergée). Cliquer **PRESS START** : l'écran affiche un QR code et un code de salle à 4 lettres.
2. Chacun scanne le QR (ou ouvre `play.html?r=CODE`) sur son téléphone et tape son prénom : il apparaît aussitôt sur l'écran.
3. Quand les 3 manettes sont connectées, on arrive à la borne et on choisit un jeu, depuis l'écran ou depuis un téléphone.

Les téléphones parlent directement à l'écran en **WebRTC (PeerJS)**. Il n'y a aucun serveur à héberger : seul le petit serveur de signalisation public de PeerJS sert à se trouver, ensuite tout circule en direct. Il faut juste que le laptop et les téléphones aient internet (même wifi ou 4G, peu importe).

Si un téléphone se met en veille ou recharge la page, il récupère sa place et la question en cours tout seul.

## Les 20 jeux

Les mêmes que la version téléphone (voir son README pour le détail), répartis en 🧠 Se connaître, 🎭 Bluff & impro, ⚡ Réflexes & apéro et 🌶️ Ça glisse. Sur l'écran, tout le monde répond **en même temps** sur sa manette ; les jeux de réflexes (Réflexe Couleur, Simon, Chrono Humain, Tap Battle) se jouent chacun sur son téléphone et le podium s'affiche sur l'écran.

**Ambiance** choisie au début de la soirée (depuis l'écran ou un téléphone) : Se connaître, Apéro (celui qui perd boit), Ça glisse, ou Mix. Chaque jeu se joue par set ; à la fin, l'écran propose un jeu au hasard, encore le même, la borne ou le podium.

**Nouvelle soirée** (écran d'accueil, podium ou réglages) : nouveaux joueurs, scores et titres à zéro, les manettes repassent par l'écran prénom. Score cumulé sur la soirée, **podium** avec titres (Le plus désigné, Le mentaliste, Le menteur pro, L'énigme…), mode **🌶️ HOT**, et **✏️ Nos questions** pour les private jokes. Tout est stocké dans le `localStorage` du laptop.

**Raccourcis écran :** `Espace`/`Entrée` = suivant · `Échap` = retour borne · ⛶ = plein écran.

## Héberger

Site statique, à mettre sur GitHub Pages (Settings → Pages → branche `main`, dossier `/`). Le QR code pointe automatiquement vers la bonne adresse. HTTPS est nécessaire pour que les téléphones puissent scanner et se connecter proprement.

### Serveur PeerJS perso (optionnel)

Pour ne pas dépendre du serveur public : `npx peerjs --port 9000 --path /` sur une machine joignable, puis ouvrir l'écran avec `index.html?peer=mon-serveur:9000`. Le QR code transmet le paramètre aux manettes.

## Structure

```
index.html          l'écran de jeu (host)
play.html           la manette (téléphone)
css/common.css      base rétro partagée
css/prompts.css     styles des invites (partagé avec la version téléphone)
css/tv.css          mise en page écran
css/play.css        coque de la manette
js/data.js          toutes les questions, punchlines, titres, ambiances
js/common.js        avatars pixel, sons 8-bit, config PeerJS
js/prompts.js       rendu des invites côté téléphone (partagé)
js/games.js         les 20 jeux, écrits une seule fois (partagé)
js/host.js          état, salle, manettes, borne, sets — côté écran
js/play.js          connexion et affichage — côté téléphone
js/vendor/          peerjs, qrcode-generator (sans CDN)
```

---
*fait maison par ske-media · Press Start*
