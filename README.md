# 🕹️ PETIT JUEGO — version écran

Le laptop est posé sur la table, tout le monde regarde l'écran, et **chaque téléphone devient une manette** en scannant un QR code. Même esprit, mêmes 5 mini-jeux et mêmes 359 questions que la [version téléphone](https://github.com/ske-media/petitjuegooo), mais en mode « jeu télé » : les votes secrets se font sur son propre téléphone, les révélations sur le grand écran.

## Comment ça marche

1. Ouvrir `index.html` sur le laptop (ou la version hébergée). Cliquer **PRESS START** : l'écran affiche un QR code et un code de salle à 4 lettres.
2. Chacun scanne le QR (ou ouvre `play.html?r=CODE`) sur son téléphone et tape son prénom : il apparaît aussitôt sur l'écran.
3. Quand les 3 manettes sont connectées, on arrive à la borne et on choisit un jeu, depuis l'écran ou depuis un téléphone.

Les téléphones parlent directement à l'écran en **WebRTC (PeerJS)**. Il n'y a aucun serveur à héberger : seul le petit serveur de signalisation public de PeerJS sert à se trouver, ensuite tout circule en direct. Il faut juste que le laptop et les téléphones aient internet (même wifi ou 4G, peu importe).

Si un téléphone se met en veille ou recharge la page, il récupère sa place et la question en cours tout seul.

## Les 5 jeux

| # | Jeu | Sur les téléphones | Sur l'écran |
|---|-----|--------------------|-------------|
| 01 | 🎯 **Qui de nous 3 ?** | Vote secret, puis pari sur le désigné | Dépouillement animé, K.O., points |
| 02 | ⏱️ **5 secondes chrono** | Le joueur appuie sur START, les deux autres jugent | Consigne géante + chrono rouge |
| 03 | 🤥 **Menteur !** | Chacun tape 2 vérités et 1 mensonge, les autres votent | Révélation phrase par phrase |
| 04 | 🧠 **Dans la tête de…** | La sellette répond, les autres devinent, tous en même temps | Les 3 réponses côte à côte, la vraie se dévoile en dernier |
| 05 | ⚖️ **Tu préfères ?** | Choix + prédiction des deux autres | Les avatars tombent sur A ou B |

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
css/tv.css          mise en page écran
css/play.css        mise en page manette
js/data.js          toutes les questions, punchlines et titres
js/common.js        avatars pixel, sons 8-bit, config PeerJS
js/host.js          moteur des 5 jeux + réseau côté écran
js/play.js          rendu des invites côté téléphone
js/vendor/          peerjs, qrcode-generator (sans CDN)
```

---
*fait maison par ske-media · Press Start*
