/**
 * Hiking hydration header scene.
 * Static public asset. Three.js loads from a CDN at runtime.
 * Poster photograph remains the real header if this never starts.
 */
async function mount(canvas, posterUrl) {
	if (!canvas || !posterUrl) return;

	const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.165.0/+esm");

	const renderer = new THREE.WebGLRenderer({
		canvas,
		alpha: true,
		antialias: false,
		powerPreference: "low-power",
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
	renderer.setClearColor(0x000000, 0);

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 20);
	camera.position.set(0, 0.04, 2.35);

	const loader = new THREE.TextureLoader();
	const texture = await loader.loadAsync(posterUrl);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = THREE.LinearFilter;

	const plane = new THREE.Mesh(
		new THREE.PlaneGeometry(3.2, 1.8),
		new THREE.MeshBasicMaterial({ map: texture }),
	);
	scene.add(plane);

	const rainCount = 280;
	const positions = new Float32Array(rainCount * 3);
	const speeds = new Float32Array(rainCount);
	for (let i = 0; i < rainCount; i += 1) {
		positions[i * 3] = (Math.random() - 0.5) * 3.4;
		positions[i * 3 + 1] = Math.random() * 2.2 - 0.4;
		positions[i * 3 + 2] = Math.random() * 0.4 + 0.05;
		speeds[i] = 0.012 + Math.random() * 0.02;
	}
	const rainGeo = new THREE.BufferGeometry();
	rainGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	const rain = new THREE.Points(
		rainGeo,
		new THREE.PointsMaterial({
			color: 0xdce8f2,
			size: 0.012,
			transparent: true,
			opacity: 0.55,
			depthWrite: false,
		}),
	);
	scene.add(rain);

	let raf = 0;
	let running = true;
	let pointerX = 0;
	let pointerY = 0;

	const onPointer = (event) => {
		const box = canvas.getBoundingClientRect();
		pointerX = ((event.clientX - box.left) / box.width - 0.5) * 0.12;
		pointerY = ((event.clientY - box.top) / box.height - 0.5) * 0.08;
	};
	canvas.addEventListener("pointermove", onPointer, { passive: true });

	const resize = () => {
		const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 1;
		const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 1;
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	};

	const tick = () => {
		if (!running) return;
		const pos = rainGeo.attributes.position.array;
		for (let i = 0; i < rainCount; i += 1) {
			pos[i * 3 + 1] -= speeds[i];
			if (pos[i * 3 + 1] < -1.1) pos[i * 3 + 1] = 1.15;
		}
		rainGeo.attributes.position.needsUpdate = true;
		plane.rotation.y += (pointerX - plane.rotation.y) * 0.04;
		plane.rotation.x += (-pointerY - plane.rotation.x) * 0.04;
		camera.position.x += (pointerX * 0.4 - camera.position.x) * 0.03;
		camera.position.y += (0.04 - pointerY * 0.2 - camera.position.y) * 0.03;
		camera.lookAt(0, 0, 0);
		renderer.render(scene, camera);
		raf = requestAnimationFrame(tick);
	};

	const ro = new ResizeObserver(resize);
	ro.observe(canvas.parentElement || canvas);
	resize();
	raf = requestAnimationFrame(tick);

	document.addEventListener("visibilitychange", () => {
		if (document.hidden) {
			running = false;
			if (raf) cancelAnimationFrame(raf);
			raf = 0;
		} else if (!running) {
			running = true;
			raf = requestAnimationFrame(tick);
		}
	});
}

function boot() {
	const root = document.querySelector("[data-hero-scene='hiking-hydration']");
	const canvas = root?.querySelector("canvas.hero-scene");
	const poster = root?.dataset.poster;
	if (!root || !canvas || !poster) return;
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	if (navigator.connection?.saveData) return;

	const start = () => {
		mount(canvas, poster)
			.then(() => root.classList.add("scene-on"))
			.catch((err) => console.warn("[hero-scene] skipped", err));
	};

	const idle = window.requestIdleCallback;
	const kick = () => {
		if (idle) idle(start);
		else window.setTimeout(start, 400);
	};

	if ("IntersectionObserver" in window) {
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					io.disconnect();
					kick();
				}
			},
			{ rootMargin: "80px" },
		);
		io.observe(root);
	} else {
		kick();
	}
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", boot);
} else {
	boot();
}
