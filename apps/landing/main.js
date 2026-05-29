// consts

const panSpeed = 14;
const fadeDuration = 1200;

const panLimit = Math.min(Math.min(window.innerWidth, window.innerHeight) * 0.22, 160);

const maps = [
    { url: 'maps/map1.jpg', startX:  panLimit, startY: -panLimit, dir: { x: -1,   y:  1   }, bgPosition: 'center'    },
    { url: 'maps/map2.jpg', startX:  panLimit, startY:  panLimit * 0.5, dir: { x: -1, y: -0.5 }, bgPosition: '65% center' },
    { url: 'maps/map3.jpg', startX: -panLimit, startY:         0, dir: { x:  1,   y:  0.1 }, bgPosition: 'center'    },
    { url: 'maps/map4.jpg', startX:         0, startY: -panLimit, dir: { x:  0,   y:  1   }, bgPosition: 'center'    },
];

// state

const layerA = document.getElementById('map-a');
const layerB = document.getElementById('map-b');
const menuEl = document.getElementById('menu');

const layers = [layerA, layerB];
let currentLayerIndex = 0;
let currentMapIndex = 0;

let panX = 0;
let panY = 0;
let lastTime = null;
let transitioning = false;
let menuRevealed = false;

// functions

function currentLayer() {
    return layers[currentLayerIndex];
}

function nextLayer() {
    return layers[(currentLayerIndex + 1) % 2];
}

function applyPan(layer, x, y) {
    layer.style.transform = `translate(${x}px, ${y}px)`;
}

function preloadImage(url) {
    const img = new Image();
    img.src = url;
}

function setLayerMap(layer, map) {
    layer.style.backgroundImage = `url('${map.url}')`;
    layer.style.backgroundPosition = map.bgPosition;
}

function startPan() {
    const first = maps[0];
    const second = maps[1];

    setLayerMap(layerA, first);
    setLayerMap(layerB, second);
    preloadImage(maps[2].url);

    panX = first.startX;
    panY = first.startY;
    applyPan(currentLayer(), panX, panY);
    currentLayer().classList.add('active');

    requestAnimationFrame(tick);
}

function tick(timestamp) {
    if (!lastTime) {
        lastTime = timestamp;
    }
    const delta = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (!transitioning) {
        const dir = maps[currentMapIndex].dir;
        panX += dir.x * panSpeed * delta;
        panY += dir.y * panSpeed * delta;
        applyPan(currentLayer(), panX, panY);

        if (Math.abs(panX) >= panLimit || Math.abs(panY) >= panLimit) {
            switchMap();
        }
    }

    requestAnimationFrame(tick);
}

function switchMap() {
    transitioning = true;

    const nextMapIndex = (currentMapIndex + 1) % maps.length;
    const nextMap = maps[nextMapIndex];
    const outgoing = currentLayer();

    const incoming = nextLayer();
    setLayerMap(incoming, nextMap);
    applyPan(incoming, nextMap.startX, nextMap.startY);
    incoming.classList.add('active');

    currentLayerIndex = (currentLayerIndex + 1) % 2;
    currentMapIndex = nextMapIndex;
    panX = nextMap.startX;
    panY = nextMap.startY;
    transitioning = false;

    setTimeout(() => {
        outgoing.classList.remove('active');
        preloadImage(maps[(nextMapIndex + 1) % maps.length].url);
    }, fadeDuration);
}

function revealMenu() {
    if (menuRevealed) return;
    menuRevealed = true;
    menuEl.classList.add('visible');
    menuEl.removeAttribute('aria-hidden');
}

function initMenu() {
    document.addEventListener('mousemove', revealMenu, { once: true });
    document.addEventListener('click', revealMenu, { once: true });
    document.addEventListener('touchstart', revealMenu, { once: true });

    document.querySelectorAll('.menu-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const pane = document.getElementById(btn.dataset.target);
            const opening = !pane.classList.contains('open');

            document.querySelectorAll('.menu-pane.open').forEach((p) => {
                p.classList.remove('open');
                p.setAttribute('aria-hidden', 'true');
            });
            document.querySelectorAll('.menu-btn.open').forEach((b) => {
                b.classList.remove('open');
            });

            if (opening) {
                pane.classList.add('open');
                pane.setAttribute('aria-hidden', 'false');
                btn.classList.add('open');
            }
        });
    });
}

// init

startPan();
initMenu();
