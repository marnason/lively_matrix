var root = {
	wavecolor: {
		r: 125,
		g: 52,
		b: 253,
	},
	rainbowSpeed: 0.5,
	rainbow: true,
	syncRainbow: false,
	matrixspeed: 50,
	matrixfontsize: 14,
	// integer amount subtracted from each cell's brightness (0-255) per frame;
	// guarantees trails reach exactly 0 (pure black) with no hue drift
	trailFade: 5,
	// target render frame rate; loop self-throttles via timestamp accumulator
	fps: 60,
};

var c = document.getElementById("c");
var ctx = c.getContext("2d");

var hueFw = false;
var hue = -0.01;

// making the canvas full screen
c.height = window.innerHeight;
c.width = window.innerWidth;

// the characters
var konkani =
	"゠アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレワヰヱヲンヺ・ーヽヿ｜二コソ";
// Array.from is unicode-safe (split("") would break on surrogate pairs)
var characters = Array.from(konkani);
var charLen = characters.length;

// 256-entry shuffled permutation table — replaces Math.random() in the
// per-fire char pick with an O(1) array index + integer multiply
var permutation = new Uint8Array(256);
for (var k = 0; k < 256; k++) permutation[k] = k;
for (var k = 255; k > 0; k--) {
	var j = (Math.random() * (k + 1)) | 0;
	var tmp = permutation[k];
	permutation[k] = permutation[j];
	permutation[j] = tmp;
}
function randChar(x) {
	var r = permutation[x & 255];
	return characters[(r * charLen) >>> 8];
}

var columns = (c.width / root.matrixfontsize) | 0; // number of columns for the rain
// drops[i] = current head row for column i
// trails[i] = active fading cells for column i: { ch, y, style, br }
var drops = new Array(columns);
var trails = new Array(columns);
for (var x = 0; x < columns; x++) {
	drops[x] = 1;
	trails[x] = [];
}

// 97 is prime — used as stagger denominator so neighbor columns are maximally offset.
var lastFrameTime = 0;
var prevRenderTime = 0;

function loop(now) {
	requestAnimationFrame(loop);

	// frame-rate cap: skip render if we're ahead of the target interval
	var interval = 1000 / root.fps;
	var delta = now - lastFrameTime;
	if (delta < interval) return;
	// align next deadline without drift
	lastFrameTime = now - (delta % interval);

	// hoist hot properties out of the inner loops
	var fontSize = root.matrixfontsize;
	var ms = root.matrixspeed; // ms per drop cycle — fully decoupled from fps
	var useRainbow = root.rainbow;
	var sync = root.syncRainbow;
	var rs = root.rainbowSpeed;
	var wc = root.wavecolor;
	var canvasW = c.width;
	var canvasH = c.height;
	var maxCells = ((canvasH / fontSize) | 0) + 4; // hard cap per column

	// Normalize elapsed time to 60fps so that trail fade and hue step are
	// fps-independent. Cap at 100ms to avoid large jumps after a tab loses focus.
	var elapsedMs =
		prevRenderTime > 0 ? Math.min(now - prevRenderTime, 100) : 16.667;
	var timeScale = elapsedMs / 16.667;
	// fade is defined as brightness units/frame at 60fps; scale to actual elapsed time
	var fade = Math.max(1, (root.trailFade * timeScale + 0.5) | 0);

	// solid-black clear (cells redraw themselves at their current brightness)
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, canvasW, canvasH);
	ctx.font = fontSize + "px arial";

	if (useRainbow && sync) {
		// scale hue step by elapsed time so rainbow speed is fps-independent
		hue += (hueFw ? 0.01 : -0.01) * timeScale;
	}

	for (var i = 0; i < columns; i++) {
		var col = trails[i];

		// Fire the column for every ms tick that elapsed since the last render.
		// Using a for-loop (not if) means drop speed is fully fps-independent:
		// at low fps multiple ticks are caught up in one render pass.
		var phase = ((i % 97) / 97) * ms;
		var firstFire =
			(Math.floor((prevRenderTime + phase) / ms) + 1) * ms - phase;
		for (var t = firstFire; t <= now; t += ms) {
			var r, g, b;
			if (useRainbow) {
				if (!sync) hue += hueFw ? 0.01 : -0.01;
				r = (127 * Math.sin(rs * hue) + 128) | 0;
				g = (127 * Math.sin(rs * hue + 2) + 128) | 0;
				b = (127 * Math.sin(rs * hue + 4) + 128) | 0;
			} else {
				r = wc.r;
				g = wc.g;
				b = wc.b;
			}

			col.push({
				ch: randChar(((t / ms) | 0) * 31 + i),
				y: drops[i] * fontSize,
				style: "rgb(" + r + "," + g + "," + b + ")",
				br: 255,
			});
			// FIFO cap: drop oldest if over the visible-row limit
			if (col.length > maxCells) col.shift();

			drops[i]++;
			if (drops[i] * fontSize > canvasH && Math.random() > 0.975) {
				drops[i] = 0;
			}
		}

		// decay + redraw + in-place compaction (no allocations)
		var x = i * fontSize;
		var write = 0;
		for (var jj = 0; jj < col.length; jj++) {
			var cell = col[jj];
			var nb = cell.br - fade;
			if (nb <= 0) continue;
			cell.br = nb;
			ctx.fillStyle = cell.style;
			ctx.globalAlpha = nb / 255;
			ctx.fillText(cell.ch, x, cell.y);
			col[write++] = cell;
		}
		col.length = write;
	}

	ctx.globalAlpha = 1;
	prevRenderTime = now;
}
requestAnimationFrame(loop);

function livelyPropertyListener(name, val) {
	switch (name) {
		case "matrixColor":
			root.wavecolor = hexToRgb(val);
			break;
		case "matrixSize":
			root.matrixfontsize = val;
			break;
		case "rainBow":
			root.rainbow = val;
			break;
		case "rainbowSpeed":
			root.rainbowSpeed = val / 100;
			break;
		case "syncRainbow":
			root.syncRainbow = val;
			break;
		case "matrixSpeed":
			root.matrixspeed = Math.round(1000 / val);
			break;
		case "trailFade":
			root.trailFade = val;
			break;
		case "frameRate":
			root.fps = val;
			break;
	}
}

function hexToRgb(hex) {
	var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result
		? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16),
			}
		: null;
}
