# Balance Mancala

**Sème les pions de tout le monde : le dernier pion fait marquer son propriétaire. À la fin, seule ta couleur la plus faible compte.**

👉 **Jouer : https://balance-mancala.onrender.com** (la première ouverture peut prendre jusqu'à une minute, le temps que le serveur gratuit se réveille)

Jeu de plateau multijoueur en ligne, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
D'après *Balance Mancala*, l'épreuve principale du 5e jour de *The Devil's Plan : Death Room* (saison 2, Netflix). Création de fans, non officielle, avec ses propres visuels.

## Règles en bref

- De 3 à 8 joueurs. Quatorze coupelles en anneau : rouges, bleues et vertes, le **Diable** en haut et l'**Ange** en bas.
- **La mise en place** : chacun son tour, on pose un de ses pions où l'on veut, deux pions au plus par coupelle.
- **À ton tour** :
  1. choisis une coupelle où tu as au moins un pion et prends **tous** ses pions, ceux des autres compris ;
  2. pose-les un par un dans les coupelles suivantes, dans le sens des aiguilles d'une montre, **dans l'ordre que tu veux** ;
  3. le propriétaire du **dernier pion** marque autant de points qu'il y a de pions dans sa coupelle, dans la couleur de la coupelle.
- Chez l'**Ange**, le dernier pion marque dans la couleur la plus basse de son propriétaire ; chez le **Diable**, dans sa plus haute. En cas d'égalité, celui qui a semé choisit.
- La partie s'arrête **dès qu'une couleur de quelqu'un atteint 20** (ou 30). Score final : **la couleur la plus basse, moins l'écart entre la plus haute et la plus basse**. Le meilleur score final gagne, puis la meilleure couleur la plus basse ; sinon, la victoire est partagée.

Les règles suivent l'épreuve de l'émission : le plateau à quatorze coupelles avec l'Ange et le Diable face à face, la pose deux par deux au plus, le semis dans l'ordre choisi, les points au propriétaire du dernier pion, la fin dès qu'une couleur atteint le score fixé, et le score final de l'émission.

Sont des choix de ce jeu :

- **Le nombre de pions suit le nombre de joueurs**, pour que le plateau soit bien rempli sans dépasser deux pions par coupelle à la pose : 6 pions à 3, 5 à 4 et 5, 4 à 6 et 7 (comme dans l'émission), 3 à 8.
- **La fin est réglable** : 20 points pour une partie courte (une dizaine de tours), 30 comme dans l'émission (une quinzaine de tours).
- **L'ordre du jeu est tiré au sort** au lancement ; le premier à poser est aussi le premier à semer.
- **Les scores de chacun sont affichés**, comme sur le tableau de l'émission. Le score final, lui, n'est jamais calculé à l'écran pendant la partie, et rien ne prévoit le résultat d'un coup : on compte les pions et les coupelles soi-même.
- **Le temps pour chaque coup est réglable** par l'hôte (sans limite, 30 ou 60 secondes) ; le temps écoulé, le pilote automatique joue à ta place.
- **Un joueur absent plus de 20 secondes est remplacé par le pilote automatique** jusqu'à son retour.

## Les bots

Ils voient ce que voit un joueur, c'est-à-dire tout le plateau et tous les scores. Pour chaque coupelle où ils ont un pion, ils essaient les ordres de semis possibles et jugent le résultat :

- leur propre balance (la couleur la plus basse compte double, les points en trop coûtent), le tout pondéré par l'avancement de la partie ;
- le tort fait aux autres : surtout au meilleur adversaire pour les bots « retors », à tout le monde pour les autres ;
- la fin de partie : un bot qui mène pousse volontiers une couleur adverse jusqu'au score de fin, en l'envoyant chez le Diable ;
- les bots « retors » regardent en plus la meilleure réponse du joueur suivant. Les « novices » se trompent plus souvent.

Contre des joueurs qui sèment au hasard, sur 200 parties par taille de table (`npx tsx test/sim.ts 200 "" 20`, puis `30`) :

| Joueurs | Pions | Tours (fin à 20) | Bot « habile » gagne | Tours (fin à 30) | Bot « habile » gagne | Hasard |
|---|---|---|---|---|---|---|
| 3 | 6 | 13,7 | 94 % | 21,9 | 92 % | 33 % |
| 4 | 5 | 12,4 | 86 % | 19,1 | 94 % | 25 % |
| 5 | 5 | 9,6 | 89 % | 16,0 | 90 % | 20 % |
| 6 | 4 | 10,5 | 72 % | 17,0 | 87 % | 17 % |
| 7 | 4 | 9,0 | 65 % | 14,6 | 76 % | 14 % |
| 8 | 3 | 11,4 | 69 % | 17,9 | 75 % | 13 % |

Entre bots, les « retors » gagnent un peu plus souvent que les « habiles », et les « novices » nettement moins. Une décision prend environ une milliseconde.

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Partie contre 2 à 7 bots en un clic
- Un geste par action : toucher une coupelle pour poser un pion ; pour semer, toucher une coupelle, puis ses pions dans l'ordre voulu (posés d'office s'ils sont tous à la même personne), puis « Semer ». Le chemin du semis est numéroté et la coupelle d'arrivée marquée d'une étoile
- Le semis s'anime pion par pion, puis le gain s'affiche au-dessus de la coupelle ; tampons pour l'Ange, le Diable et la fin de partie
- Les scores de chacun dans ses trois couleurs, la coupelle et les pions de chaque joueur à ses couleurs et à son numéro
- Fin de partie : qui a fait déborder quelle couleur, le classement avec le calcul du score final et les barres de chaque couleur, victoires de la soirée, revanche en un clic
- Réactions et phrases toutes faites (« Au Diable ! », « Merci, l'Ange », « On s'allie ? »), règles consultables en jeu
- Reprise automatique après une coupure, pilote automatique, spectateurs
- Sons synthétisés et vibrations, animations réduites si le système le demande

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3220
npm run dev:client   # interface sur http://localhost:5201
npm test             # plateau, pose, semis, Ange et Diable, égalités, fin, classement, bots
npm run build && npm run e2e   # parties complètes avec de vrais clients connectés
npx tsx test/sim.ts 200        # force des bots : 200 parties par taille de table
```

`BM_FAST=1` accélère les bots, les animations et les chronos (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur, plateau, pions selon le nombre de joueurs, score final, rythme des animations
- `server/` : Express + Socket.IO, moteur de partie (`game.ts`), bots (`bots.ts`), table et minuteries (`room.ts`). Le serveur fait autorité : il vérifie chaque coup, attend la fin de l'animation du semis avant de passer au joueur suivant, et chacun ne reçoit que la vue de la table
- `client/` : React + Vite + Framer Motion. Le plateau et ses coupelles sont dans `components/Board.tsx`, la table, la poignée et l'animation du semis dans `screens/Table.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
