# Parkour — scheletro minimo

Questo è lo scheletro minimo del gioco di parkour. Si apre nel browser e si vede.

## Come si avvia

Doppio clic su **index.html** (oppure **avvia.bat**). Il gioco è un sito statico: non richiede server e può essere pubblicato su Vercel.

## Cosa c'è già

- scena 3D con Three.js, telecamera in terza persona, luci
- mappa demo caricata da `mappa/ParckourScene.gltf`
- personaggio caricato da `Personaggio/model.glb`
- giocatore: movimento WASD + salto con Spazio, mouse per guardare
- menu iniziale con pulsante "Clicca per giocare"
- controlli touch (joystick e tasto Salta) per dispositivi mobili
- gioco in singolo giocatore se non c'è un server WebSocket

## File

| file | a cosa serve |
| --- | --- |
| `index.html` | pagina, menu iniziale, HUD |
| `gioco.js` | scena, personaggi, mappa, giocatore, ciclo di disegno |
| `rete.js` | client WebSocket (si degrada in singolo giocatore se non c'è server) |
| `vercel.json` | configurazione per il deploy su Vercel |
| `vendor/` | Three.js e GLTFLoader (stessa versione) |

## Deploy su Vercel

Il gioco è pronto per Vercel come sito statico: basta collegare la cartella al progetto Vercel e fare il push. Non serve un server Node.js né un WebSocket.
