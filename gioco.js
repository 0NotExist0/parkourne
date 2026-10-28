// Parkour - scheletro minimo che si apre e si vede.
//
// Parti: scena, personaggio (Personaggio/model.glb), mappa (mappa/ParckourScene.gltf),
// giocatore (movimento WASD + salto), ciclo di disegno.

import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { collega } from './rete.js';

const ALTEZZA_OCCHI = 1.7;      // altezza collisione del personaggio
const VELOCITA = 6;             // passi al secondo
const GRAVITA = 22;
const FORZA_SALTO = 8;

// Terza persona: la camera sta dietro e sopra il personaggio.
const DISTANZA_CAMERA = 5;      // quanto sta dietro il personaggio
const ALTEZZA_CAMERA = 3;       // quanto sta sopra il personaggio
const ROTAZIONE_VELOCITA = 8;   // radiante al secondo: quanto velocemente il personaggio gira verso il movimento

// Terza persona: la camera orbita fluida attorno al personaggio.
const CAMERA_SEGUIMENTO = 10;   // quanto velocemente la camera raggiunge la posizione ideale
const CAMERA_ALTEZZA_MIRA = ALTEZZA_OCCHI * 0.6;   // punto del personaggio su cui punta la camera (testa)

// ------------------------------------------------------------------ scena e telecamera

const scena = new THREE.Scene();
scena.background = new THREE.Color(0x87ceeb);
scena.fog = new THREE.Fog(0x87ceeb, 20, 60);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scena.add(new THREE.AmbientLight(0xffffff, 1.0));
const sole = new THREE.DirectionalLight(0xffffff, 1.5);
sole.position.set(20, 40, 10);
scena.add(sole);

// Carico la mappa demo e il personaggio gi\`a presenti nel progetto.
let mappa = null;
let personaggio = null;
const blocchi = [];   // bounding box dei cubi della mappa (per le collisioni)
const loader = new GLTFLoader();

loader.load('mappa/ParckourScene.gltf', function (gltf) {
  mappa = gltf.scene;
  scena.add(mappa);
  camera.position.set(-5, 2, 0);
  camera.lookAt(-5, 1, 0);
  // Raccoglie i bounding box di ogni cubo della mappa per le collisioni.
  // setFromObject includerebbe l'intera gerarchia (figli, trasformazioni annidate)
  // creando box troppo grandi o fuori posto rispetto alla geometria reale.
  // Si clona invece la geometria locale, la si trasforma con la matrice mondiale
  // dell'oggetto e se ne calcola il box: corrisponde esattamente alla mesh visibile.
  mappa.traverse(function (oggetto) {
    if (oggetto.isMesh && oggetto.geometry) {
      const geometria = oggetto.geometry.clone();
      geometria.applyMatrix4(oggetto.matrixWorld);
      const box = new THREE.Box3().setFromBufferAttribute(geometria.attributes.position);
      blocchi.push({ mesh: oggetto, box: box });
    }
  });
});

loader.load('Personaggio/model.glb', function (gltf) {
  personaggio = gltf.scene;
  scena.add(personaggio);
  personaggio.position.set(0, 0, 0);
  // Il modello 3D e' l'avatar visibile: lo si lega al giocatore e lo si ruota con lui.
  // Partenza ruotata di 180 gradi rispetto alla direzione iniziale.
  personaggio.rotation.y = Math.PI;
});

// ------------------------------------------------------------------ il giocatore e i comandi (base)

const giocatore = {
  x: -5, z: 0, y: 2,
  vy: 0, ry: Math.PI, rx: 0, aTerra: true
};
const tasti = {};
const touch = {
  joystickAttivo: false,
  stickX: 0,
  stickY: 0,
  ultimoX: 0,
  ultimoY: 0,
  ditoJoystick: null,   // identifier del dito che sta usando il joystick
  ditoSwipe: null       // identifier del dito che sta facendo swipe per guardarsi
};
function toccoPerDito(e, dito) {
  if (dito === null) return null;
  for (let i = 0; i < e.touches.length; i++) {
    if (e.touches[i].identifier === dito) return e.touches[i];
  }
  return null;
}
// Rotazione indipendente della camera: controllata solo da mouse e touch sul canvas,
// NON dal joystick (che muove soltanto il personaggio).
let cameraRy = 0;
let cameraRx = 0;
let inPartita = false;
let statoRete = null;

// Variabili riutilizzate per la camera fluida (non alloco ogni frame).
const cameraIdeale = new THREE.Vector3();
const miraCamera = new THREE.Vector3();
const quatAttuale = new THREE.Quaternion();
const quatDesiderato = new THREE.Quaternion();

// Torna al menu iniziale: rilascia il mouse, nasconde HUD e mirino, mostra di nuovo il bottone di gioco.
function esciDallaPartita() {
  inPartita = false;
  document.exitPointerLock();
  document.getElementById('inizio').hidden = false;
  document.getElementById('hud').hidden = true;
  document.getElementById('mirino').hidden = true;
  document.getElementById('controlli-touch').hidden = true;
  // Evita che un tasto premuto prima di uscire resti "premuto" al rientro.
  for (const k in tasti) tasti[k] = false;
}

window.addEventListener('keydown', function (e) {
  tasti[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'Escape' && inPartita) esciDallaPartita();
});
window.addEventListener('keyup', function (e) { tasti[e.code] = false; });

window.addEventListener('pointerlockchange', function () {
  if (document.pointerLockElement !== renderer.domElement && inPartita) {
    esciDallaPartita();
  }
});

window.addEventListener('mousemove', function (e) {
  if (document.pointerLockElement !== renderer.domElement) return;
  cameraRy -= e.movementX * 0.0025;
  cameraRx -= e.movementY * 0.0025;
  cameraRx = Math.max(-1.5, Math.min(1.5, cameraRx));
});

document.getElementById('gioca').addEventListener('click', function () {
  inPartita = true;
  statoRete = collega({});
  document.getElementById('inizio').hidden = true;
  document.getElementById('hud').hidden = false;
  document.getElementById('mirino').hidden = false;
  // Porta il focus sul canvas prima di chiedere il blocco del mouse, altrimenti
  // il lock fallisce (il focus resta sul bottone appena cliccato) e il pointerlockchange
  // riporta subito al menu principale.
  renderer.domElement.focus();
  const richiesta = renderer.domElement.requestPointerLock();
  if (richiesta && typeof richiesta.catch === 'function') richiesta.catch(function () {});
  // Su Android i controlli touch restano visibili per muoversi e saltare.
  document.getElementById('controlli-touch').hidden = false;
});

// Mostra l'URL raggiungibile da dispositivi esterni e abilita la copia negli appunti.
// Quando si gioca in localhost l'indirizzo da condividere e' l'IP della LAN,
// ottenuto chiedendolo al server (endpoint /ip). Il server espone solo HTTP,
// quindi non viene mai forzato l'HTTPS.
(function () {
  const linkEsterno = document.getElementById('link-esterno');
  const urlPubblico = document.getElementById('url-pubblico');
  const copiaLink = document.getElementById('copia-link');
  if (!linkEsterno || !urlPubblico || !copiaLink) return;

  const host = window.location.hostname;
  const porta = window.location.port || '8000';
  const èLocale = host === 'localhost' || host === '127.0.0.1' || host === '::1';

  function mostraUrl(url) {
    urlPubblico.textContent = url;
    linkEsterno.hidden = false;
    urlPubblico.hidden = false;
    copiaLink.hidden = false;

    copiaLink.addEventListener('click', function () {
      navigator.clipboard.writeText(url).then(function () {
        const testoOrig = copiaLink.textContent;
        copiaLink.textContent = 'Copiato!';
        setTimeout(function () { copiaLink.textContent = testoOrig; }, 1500);
      }, function () {
        // Fallback per browser che non supportano l'API degli appunti.
        try { urlPubblico.select(); } catch (e) {}
        document.execCommand('copy');
      });
    });
  }

  if (èLocale) {
    fetch('/ip', { cache: 'no-cache' })
      .then(function (risposta) { return risposta.text(); })
      .then(function (ip) {
        ip = (ip || '').trim();
        if (ip) mostraUrl('http://' + ip + ':' + porta);
        else mostraUrl(window.location.origin);
      })
      .catch(function () { mostraUrl(window.location.origin); });
  } else {
    mostraUrl(window.location.origin);
  }
})();

const joystick = document.getElementById('joystick');
const stick = document.getElementById('joystick-stick');
const btnSalta = document.getElementById('btn-salta');

function muoviStick(dx, dy) {
  const massimo = 40;
  dx = Math.max(-massimo, Math.min(massimo, dx));
  dy = Math.max(-massimo, Math.min(massimo, dy));
  stick.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
  touch.stickX = dx / massimo;
  touch.stickY = dy / massimo;
}

function resetStick() {
  touch.stickX = 0;
  touch.stickY = 0;
  stick.style.transform = 'translate(-50%, -50%)';
}

joystick.addEventListener('touchstart', function (e) {
  e.preventDefault();
  const t = e.changedTouches[0];
  touch.ditoJoystick = t.identifier;
  touch.joystickAttivo = true;
  const r = joystick.getBoundingClientRect();
  muoviStick(t.clientX - r.left - r.width / 2, t.clientY - r.top - r.height / 2);
}, { passive: false });

joystick.addEventListener('touchmove', function (e) {
  if (!touch.joystickAttivo || touch.ditoJoystick === null) return;
  e.preventDefault();
  const t = toccoPerDito(e, touch.ditoJoystick);
  if (!t) return;
  const r = joystick.getBoundingClientRect();
  muoviStick(t.clientX - r.left - r.width / 2, t.clientY - r.top - r.height / 2);
}, { passive: false });

joystick.addEventListener('touchend', function (e) {
  e.preventDefault();
  touch.joystickAttivo = false;
  touch.ditoJoystick = null;
  resetStick();
});
joystick.addEventListener('touchcancel', function (e) {
  touch.joystickAttivo = false;
  touch.ditoJoystick = null;
  resetStick();
});
joystick.addEventListener('pointercancel', function (e) {
  touch.joystickAttivo = false;
  touch.ditoJoystick = null;
  resetStick();
});

btnSalta.addEventListener('touchstart', function (e) {
  e.preventDefault();
  tasti.Space = true;
}, { passive: false });

btnSalta.addEventListener('touchend', function (e) {
  e.preventDefault();
  tasti.Space = false;
});
btnSalta.addEventListener('touchcancel', function (e) {
  tasti.Space = false;
});

// Swipe a destra per guardarsi intorno (look), come il mouse con pointer lock.
renderer.domElement.addEventListener('touchstart', function (e) {
  const t = e.changedTouches[0];
  touch.ditoSwipe = t.identifier;
  touch.ultimoX = t.clientX;
  touch.ultimoY = t.clientY;
}, { passive: true });

renderer.domElement.addEventListener('touchmove', function (e) {
  if (!inPartita || touch.joystickAttivo || touch.ditoSwipe === null) return;
  const t = toccoPerDito(e, touch.ditoSwipe);
  if (!t) return;
  e.preventDefault();
  const dx = t.clientX - touch.ultimoX;
  const dy = t.clientY - touch.ultimoY;
  touch.ultimoX = t.clientX;
  touch.ultimoY = t.clientY;
  cameraRy -= dx * 0.0025;
  cameraRx -= dy * 0.0025;
  cameraRx = Math.max(-1.5, Math.min(1.5, cameraRx));
}, { passive: false });

renderer.domElement.addEventListener('touchend', function (e) {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === touch.ditoSwipe) {
      touch.ditoSwipe = null;
      break;
    }
  }
});
renderer.domElement.addEventListener('touchcancel', function (e) {
  touch.ditoSwipe = null;
});

const raggioGiocatore = 0.4;   // raggio del cilindro di collisione del giocatore
const direzioneCamera = new THREE.Vector3();   // riutilizzato per non allocare ogni frame

function collideConBlocchi(nuovoX, nuovoZ) {
  const minX = nuovoX - raggioGiocatore;
  const maxX = nuovoX + raggioGiocatore;
  const minZ = nuovoZ - raggioGiocatore;
  const maxZ = nuovoZ + raggioGiocatore;
  for (let i = 0; i < blocchi.length; i++) {
    const b = blocchi[i].box;
    // Sovrapposizione verticale tra il corpo del giocatore (piedi a testa) e il blocco.
    // Un blocco blocca il movimento orizzontale solo se il giocatore ne tocca il fianco:
    // i piedi devono essere sotto la cima del blocco. Se ci sta sopra (piedi alla cima),
    // non e' un ostacolo: altrimenti il pavimento su cui si sta bloccherebbe ogni passo.
    if (giocatore.y > b.min.y - 0.2 && giocatore.y - ALTEZZA_OCCHI < b.max.y - 0.2) {
      if (minX < b.max.x && maxX > b.min.x && minZ < b.max.z && maxZ > b.min.z) {
        return true;
      }
    }
  }
  return false;
}

function muoviGiocatore(dt) {
  const avantiTasti = (tasti.KeyW ? 1 : 0) - (tasti.KeyS ? 1 : 0);
  const latoTasti = (tasti.KeyD ? 1 : 0) - (tasti.KeyA ? 1 : 0);

  const joystickAttivo = touch.stickX !== 0 || touch.stickY !== 0;

  // Contributi di movimento: tastiera e joystick si sommano.
  // Joystick: spingere in alto = avanti (-stickY), spingere a destra = destra (+stickX),
  // tutto ruotato rispetto a dove guarda la camera (cameraRy).
  var avanti = avantiTasti;
  var lato = latoTasti;
  if (joystickAttivo) {
    avanti += -touch.stickY;
    lato += touch.stickX;
  }
  // Non andare piu' veloci in diagonale: limita la magnitudine combinata a 1.
  const mag = Math.sqrt(avanti * avanti + lato * lato);
  if (mag > 1) { avanti /= mag; lato /= mag; }

  const sin = Math.sin(cameraRy);
  const cos = Math.cos(cameraRy);
  const dx = (-sin * avanti + cos * lato) * VELOCITA * dt;
  const dz = (-cos * avanti - sin * lato) * VELOCITA * dt;

  // Movimento orizzontale con collisione AABB contro i blocchi della mappa.
  if (!collideConBlocchi(giocatore.x + dx, giocatore.z)) giocatore.x += dx;
  if (!collideConBlocchi(giocatore.x, giocatore.z + dz)) giocatore.z += dz;

  if (tasti.Space && giocatore.aTerra) {
    giocatore.vy = FORZA_SALTO;
    giocatore.aTerra = false;
  }
  giocatore.vy -= GRAVITA * dt;
  giocatore.y += giocatore.vy * dt;

  // Collisione verticale: non passare attraverso i blocchi dall'alto o dal basso.
  let aTerra = false;
  for (let i = 0; i < blocchi.length; i++) {
    const b = blocchi[i].box;
    const dentroXY = giocatore.x > b.min.x - raggioGiocatore && giocatore.x < b.max.x + raggioGiocatore &&
                     giocatore.z > b.min.z - raggioGiocatore && giocatore.z < b.max.z + raggioGiocatore;
    if (dentroXY) {
      const piedi = giocatore.y - ALTEZZA_OCCHI;
      // Caduta dall'alto: si ferma sul tetto del blocco.
      // Se i piedi hanno toccato o superato il tetto (per via del passo di gravita' appena applicato),
      // riportali in superficie invece di lasciarli cadere attraverso.
      if (giocatore.vy <= 0 && piedi <= b.max.y && piedi >= b.min.y) {
        giocatore.y = b.max.y + ALTEZZA_OCCHI;
        giocatore.vy = 0;
        aTerra = true;
      }
      // Urto dal basso: si ferma sotto il blocco.
      if (giocatore.vy > 0 && giocatore.y + ALTEZZA_OCCHI < b.min.y && giocatore.y + ALTEZZA_OCCHI + giocatore.vy * dt >= b.min.y) {
        giocatore.y = b.min.y - ALTEZZA_OCCHI;
        giocatore.vy = 0;
      }
    }
  }
  if (!aTerra && giocatore.y < ALTEZZA_OCCHI) {
    giocatore.y = ALTEZZA_OCCHI;
    giocatore.vy = 0;
    aTerra = true;
  }
  giocatore.aTerra = aTerra;

  // Ruota il personaggio verso la direzione di movimento (unificato WASD + joystick).
  const muovesi = avanti !== 0 || lato !== 0;
  if (muovesi) {
    var angoloDesiderato = Math.atan2(-dx, -dz);
    var diff = angoloDesiderato - giocatore.ry;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    var passo = ROTAZIONE_VELOCITA * dt;
    if (Math.abs(diff) < passo) {
      giocatore.ry = angoloDesiderato;
    } else {
      giocatore.ry += passo * (diff > 0 ? 1 : -1);
    }
  }

  // Il player guarda sempre dove si muove (o dove guarda la camera se fermo).
  if (personaggio) {
    personaggio.position.set(giocatore.x, giocatore.y - ALTEZZA_OCCHI, giocatore.z);
    personaggio.rotation.y = muovesi ? giocatore.ry : cameraRy;
  }

  // Dietro il personaggio rispetto a dove guarda la camera.
  // cameraRy ruota attorno al personaggio (orizzontale), cameraRx alza/abbassa
  // la visuale per guardare in basso o in alto (verticale).
  // La distanza orizzontale resta costante: solo l'altezza varia con l'inclinazione.
  const dietroX = Math.sin(cameraRy) * DISTANZA_CAMERA;
  const dietroZ = Math.cos(cameraRy) * DISTANZA_CAMERA;
  const altezza = ALTEZZA_CAMERA + Math.sin(cameraRx) * 2;

  // Posizione ideale della camera (dietro e sopra il personaggio).
  cameraIdeale.set(
    giocatore.x + dietroX,
    giocatore.y + altezza,
    giocatore.z + dietroZ
  );

  // Movimento fluido della camera verso la posizione ideale (nessuno scatto).
  camera.position.lerp(cameraIdeale, CAMERA_SEGUIMENTO * dt);

  // Punto di mira: testa del personaggio (piu naturale del torace).
  miraCamera.set(
    giocatore.x,
    giocatore.y + CAMERA_ALTEZZA_MIRA,
    giocatore.z
  );

  // Rotazione fluida verso il punto di mira (nessuno scatto).
  quatAttuale.copy(camera.quaternion);
  camera.lookAt(miraCamera);
  quatDesiderato.copy(camera.quaternion);
  camera.quaternion.copy(quatAttuale);
  camera.quaternion.slerp(quatDesiderato, CAMERA_SEGUIMENTO * dt);
}

// ------------------------------------------------------------------ schermo e ciclo del gioco

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let ultimoIstante = performance.now();

// Hook diagnostico di sola lettura: espone lo stato attuale del giocatore
// per verificare che i comandi (move/look/jump) cambino realmente lo stato.
window.__statoGioco = function () {
  return {
    x: giocatore.x, y: giocatore.y, z: giocatore.z,
    ry: giocatore.ry, aTerra: giocatore.aTerra,
    cameraRy: cameraRy, inPartita: inPartita
  };
};

function cicloDelGioco() {
  const ora = performance.now();
  const dt = Math.min(0.05, (ora - ultimoIstante) / 1000);
  ultimoIstante = ora;

  if (inPartita) muoviGiocatore(dt);
  if (statoRete && statoRete.collegato && inPartita) {
    statoRete.manda({ tipo: 'stato', x: giocatore.x, y: giocatore.y, z: giocatore.z, ry: giocatore.ry });
  }
  renderer.render(scena, camera);
}
renderer.setAnimationLoop(cicloDelGioco);
