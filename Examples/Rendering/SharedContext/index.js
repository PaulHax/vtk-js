import '@kitware/vtk.js/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkConeSource from '@kitware/vtk.js/Filters/Sources/ConeSource';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkLight from '@kitware/vtk.js/Rendering/Core/Light';
import vtkSharedRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/SharedRenderWindow';

// ----------------------------------------------------------------------------
// City data for geo-positioned cones
// ----------------------------------------------------------------------------

const cities = [
  { name: 'New York', lng: -74.006, lat: 40.7128, color: [1.0, 0.5, 0.0] },
  { name: 'Chicago', lng: -87.6298, lat: 41.8781, color: [0.5, 1.0, 0.0] },
  { name: 'Denver', lng: -104.9903, lat: 39.7392, color: [0.0, 0.5, 1.0] },
];

// ----------------------------------------------------------------------------
// Load MapLibre GL JS dynamically
// ----------------------------------------------------------------------------

function loadMapLibre() {
  return new Promise((resolve, reject) => {
    if (window.maplibregl) {
      resolve(window.maplibregl);
      return;
    }

    const link = document.createElement('link');
    link.href = 'https://unpkg.com/maplibre-gl@5.16.0/dist/maplibre-gl.css';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/maplibre-gl@5.16.0/dist/maplibre-gl.js';
    script.onload = () => resolve(window.maplibregl);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ----------------------------------------------------------------------------
// Setup page layout
// ----------------------------------------------------------------------------

document.body.style.margin = '0';
document.body.style.padding = '0';

const mapContainer = document.createElement('div');
mapContainer.id = 'map';
mapContainer.style.width = '100vw';
mapContainer.style.height = '100vh';
document.body.appendChild(mapContainer);

const IDENTITY_VIEW_MATRIX = new Float64Array([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

// ----------------------------------------------------------------------------
// Main initialization
// ----------------------------------------------------------------------------

async function init() {
  const maplibregl = await loadMapLibre();

  // Create MapLibre map
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'osm',
          type: 'raster',
          source: 'osm',
        },
      ],
    },
    center: [-90, 40],
    zoom: 4,
    antialias: true,
  });

  window._map = map;
  await new Promise((resolve) => {
    map.on('load', resolve);
  });

  // Create VTK render window and renderer
  const renderWindow = vtkRenderWindow.newInstance();
  const renderer = vtkRenderer.newInstance();
  renderer.setBackground(0, 0, 0, 0);
  renderer.setPreserveColorBuffer(true);
  renderer.setPreserveDepthBuffer(true);
  // Shared-context rendering uses a MapLibre-provided matrix, so bypass
  // vtk.js automatic headlights and drive a camera-following scene light.
  renderer.setAutomaticLightCreation(false);
  renderWindow.addRenderer(renderer);

  const viewLight = vtkLight.newInstance();
  viewLight.setLightTypeToSceneLight();
  viewLight.setPositional(true);
  viewLight.setConeAngle(180);
  renderer.addLight(viewLight);

  // Create cone actors at city locations in Mercator coordinates
  cities.forEach((city) => {
    const mercator = maplibregl.MercatorCoordinate.fromLngLat(
      [city.lng, city.lat],
      0
    );
    const scale = mercator.meterInMercatorCoordinateUnits() * 100000; // 100km cones

    const coneSource = vtkConeSource.newInstance({
      height: 1.0,
      radius: 0.3,
      resolution: 12,
      direction: [0, 0, -1],
      capping: true,
    });
    const mapper = vtkMapper.newInstance();
    mapper.setInputConnection(coneSource.getOutputPort());
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.setPosition(mercator.x, mercator.y, scale * 0.5);
    actor.setScale(scale, scale, scale);
    actor.getProperty().setColor(...city.color);
    actor.getProperty().setAmbient(0.4);
    actor.getProperty().setDiffuse(0.6);
    renderer.addActor(actor);

    const sphereSource = vtkSphereSource.newInstance({
      radius: 0.3,
      thetaResolution: 32,
      phiResolution: 32,
    });
    const sphereMapper = vtkMapper.newInstance();
    sphereMapper.setInputConnection(sphereSource.getOutputPort());
    const sphereActor = vtkActor.newInstance();
    sphereActor.setMapper(sphereMapper);
    sphereActor.setPosition(mercator.x, mercator.y, scale * 1.45);
    sphereActor.setScale(scale * 0.75, -scale * 0.75, scale * 0.75);
    sphereActor.getProperty().setColor(...city.color);
    sphereActor.getProperty().setAmbient(0.0);
    sphereActor.getProperty().setDiffuse(1.0);
    renderer.addActor(sphereActor);
  });

  // Fit map to show all cities
  const bounds = new maplibregl.LngLatBounds();
  cities.forEach((city) => bounds.extend([city.lng, city.lat]));
  map.fitBounds(bounds, { padding: 100 });

  // Store VTK objects that will be initialized in onAdd
  let openglRenderWindow = null;

  // Use CustomLayerInterface for proper matrix access
  const vtkLayer = {
    id: 'vtk-cones',
    type: 'custom',
    renderingMode: '3d',

    onAdd(mapInstance, gl) {
      const canvas = mapInstance.getCanvas();
      openglRenderWindow = vtkSharedRenderWindow.createFromContext(canvas, gl);
      renderWindow.addView(openglRenderWindow);
    },

    render(renderGl, args) {
      if (!openglRenderWindow) return;
      const camera = renderer.getActiveCamera();
      const cameraLngLat = map.transform.getCameraLngLat();
      const cameraAltitude = map.transform.getCameraAltitude();
      const cameraMercator = maplibregl.MercatorCoordinate.fromLngLat(
        cameraLngLat,
        cameraAltitude
      );
      const targetMercator = maplibregl.MercatorCoordinate.fromLngLat(
        map.getCenter(),
        typeof map.getCameraTargetElevation === 'function'
          ? map.getCameraTargetElevation()
          : 0
      );

      viewLight.setPosition(
        cameraMercator.x,
        cameraMercator.y,
        cameraMercator.z
      );
      viewLight.setFocalPoint(
        targetMercator.x,
        targetMercator.y,
        targetMercator.z
      );

      camera.setViewMatrix(IDENTITY_VIEW_MATRIX);
      camera.setProjectionMatrix(args.defaultProjectionData.mainMatrix);
      camera.modified();

      // MapLibre's projection includes a handedness flip, so compensate while
      // rendering vtk.js geometry in the shared context.
      const previousFrontFace = renderGl.getParameter(renderGl.FRONT_FACE);
      renderGl.frontFace(renderGl.CW);
      try {
        openglRenderWindow.renderShared();
      } finally {
        renderGl.frontFace(previousFrontFace);
      }
    },
  };

  map.addLayer(vtkLayer);
}

init();
