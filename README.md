# OtaKu Quiz 🧠

🎮 **Jouer : https://otakuquiz-zlnr.onrender.com**

Quiz otaku en direct entre amis. Un animateur crée un quiz, partage un code ou un lien sur WhatsApp, et chacun joue depuis son téléphone, même depuis un autre pays.

## Comment ça marche

**Admins** (avec le code admin de la communauté) :
1. **Créer Quiz** → entre le code admin et ton nom.
2. La bibliothèque **Mes Quiz** est partagée entre tous les admins, avec le nom de l'auteur de chaque quiz. Tout admin peut créer, modifier, supprimer et lancer n'importe quel quiz.
3. Types de questions : **choix multiple** (2 à 4 réponses), **vrai / faux**, **réponse libre** (plusieurs réponses acceptées, sans tenir compte des majuscules ni des accents). Image et chrono par question.
4. **Lancer une partie** (▶) : un code de 4 caractères et un bouton WhatsApp pour partager le lien.
5. Pendant la partie, l'admin anime : il voit qui a répondu, valide les réponses libres proches, affiche les résultats et passe à la question suivante.

**Joueurs** (sans code admin) : **Joindre Quiz**, le code de la partie, un pseudo, et c'est parti.

Points : 500 par bonne réponse + jusqu'à 500 de bonus de rapidité. Classement après chaque question et podium final. Un joueur qui recharge sa page revient dans la partie avec son score.

Le bouton partager d'un quiz exporte un fichier `.otakuquiz.json`, réimportable dans la bibliothèque.

## Lancer en local

Aucune dépendance, il faut seulement Node.js 18 ou plus récent.

```bash
ADMIN_CODE=mon-code node server.js
```

Puis ouvre http://localhost:3000. Sans `DATABASE_URL`, les quiz sont enregistrés dans `data/quizzes.json`.

## Mettre en ligne (Render + Neon, gratuits)

Variables d'environnement du service Render :

| Variable | Rôle |
|---|---|
| `ADMIN_CODE` | Code secret donné aux admins. Le changer déconnecte tous les admins. |
| `DATABASE_URL` | Chaîne de connexion de la base Neon (Postgres). La table est créée automatiquement. |

Le serveur gratuit Render se met en veille après 15 minutes sans visite (environ 50 secondes de réveil). Les quiz sont dans Neon, ils ne sont jamais perdus ; seule une partie en cours serait interrompue si le serveur redémarre.

Le dépôt est relié par son URL publique : après un push, lance **Manual Deploy → Deploy latest commit** dans Render.

## Structure

```
server.js            # serveur HTTP + WebSocket
server/websocket.js  # WebSocket minimal, sans dépendance
server/game.js       # salons, questions, scores, reconnexions
server/api.js        # espace admin et API de la bibliothèque
server/store.js      # stockage : Neon (SQL over HTTP) ou fichier local
public/              # pages web
  index.html         # accueil
  quizzes.html       # connexion admin + bibliothèque partagée
  editor.html        # création / modification d'un quiz
  host.html          # écran de l'animateur
  join.html          # écran des joueurs
  css/app.css        # styles (design Figma « Quizz App »)
  js/                # scripts des pages
```

