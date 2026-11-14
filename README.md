# OtaKu Quiz 🧠

🎮 **Jouer : https://otakuquiz-zlnr.onrender.com**

Quiz otaku en direct entre amis. Un animateur crée un quiz, partage un code ou un lien sur WhatsApp, et chacun joue depuis son téléphone, même depuis un autre pays.

## Comment ça marche

1. **Créer Quiz** : crée un quiz (nom, description) puis ajoute des questions :
   - **Choix multiple** (2 à 4 réponses),
   - **Vrai / Faux**,
   - **Réponse libre** (plusieurs réponses acceptées, sans tenir compte des majuscules ni des accents).
   Chaque question peut avoir une image et son propre chrono.
2. **Lancer une partie** (bouton ▶ dans *Mes Quiz*) : la partie reçoit un code de 4 caractères. Partage-le avec le bouton WhatsApp ou copie le lien.
3. **Joindre Quiz** : les joueurs entrent le code (ou ouvrent le lien) et choisissent un pseudo.
4. L'animateur lance la partie. Tout le monde voit la même question en même temps.
   - Points : 500 pour une bonne réponse + jusqu'à 500 de bonus de rapidité.
   - Pour les réponses libres, l'animateur peut valider une réponse proche avant d'afficher les résultats.
5. Classement après chaque question, puis podium final.

Les quiz sont enregistrés dans le navigateur de l'animateur. Le bouton partager exporte un fichier `.otakuquiz.json`, que l'on peut réimporter dans *Mes Quiz*.

Si un joueur recharge la page ou perd sa connexion, il revient automatiquement dans la partie avec son score.

## Lancer en local

Aucune dépendance, il faut seulement Node.js 18 ou plus récent.

```bash
node server.js
```

Puis ouvre http://localhost:3000. Pour tester à plusieurs sur le même Wi-Fi, ouvre `http://<adresse-IP-de-ton-PC>:3000` sur les téléphones.

## Mettre en ligne (Render, gratuit)

Le jeu a besoin d'une connexion en temps réel (WebSocket), ce que Vercel ne gère pas. Render le fait gratuitement :

1. Crée un compte sur https://render.com avec GitHub.
2. **New → Blueprint**, choisis ce dépôt : Render lit `render.yaml` et crée le service.
3. L'app est en ligne sur https://otakuquiz-zlnr.onrender.com.

Le dépôt est relié par son URL publique : après un push, lance **Manual Deploy → Deploy latest commit** dans Render (ou connecte GitHub à Render pour les déploiements automatiques).

Sur l'offre gratuite, le serveur se met en veille après 15 minutes sans visite : la première ouverture prend environ 30 secondes. Ouvre le site quelques instants avant de lancer une partie.

## Structure

```
server.js            # serveur HTTP + WebSocket
server/websocket.js  # WebSocket minimal, sans dépendance
server/game.js       # salons, questions, scores, reconnexions
public/              # pages web
  index.html         # accueil
  quizzes.html       # Mes Quiz
  editor.html        # création / modification d'un quiz
  host.html          # écran de l'animateur
  join.html          # écran des joueurs
  css/app.css        # styles (design Figma « Quizz App »)
  js/                # scripts des pages
```

## Prochaines étapes

- Comptes (email + mot de passe) et quiz sauvegardés en ligne
