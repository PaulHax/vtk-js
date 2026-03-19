import '@kitware/vtk.js/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkConeSource from '@kitware/vtk.js/Filters/Sources/ConeSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
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

  await new Promise((resolve) => {
    map.on('load', resolve);
  });

  // Create VTK render window and renderer
  const renderWindow = vtkRenderWindow.newInstance();
  const renderer = vtkRenderer.newInstance();
  renderer.setBackground(0, 0, 0, 0);
  renderer.setPreserveColorBuffer(true);
  renderer.setPreserveDepthBuffer(true);
  renderWindow.addRenderer(renderer);

  // Create cone actors at city locations in Mercator coordinates
  cities.forEach((city) => {
    const mercator = maplibregl.MercatorCoordinate.fromLngLat(
      [city.lng, city.lat],
      0
    );
    const scale = mercator.meterInMercatorCoordinateUnits() * 100000; // 100km cones

    const coneSource = vtkConeSource.newInstance({
      height: 1.0,
      radius: 0.5,
      direction: [0, 0, 1],
    });
    const mapper = vtkMapper.newInstance();
    mapper.setInputConnection(coneSource.getOutputPort());
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.setPosition(mercator.x, mercator.y, scale * 0.5);
    actor.setScale(scale, scale, scale);
    actor.getProperty().setColor(...city.color);
    renderer.addActor(actor);
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

      // Identity view matrix
      const identity = new Float64Array([
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
      ]);
      camera.setViewMatrix(identity);

      // MapLibre 5.x: use defaultProjectionData.mainMatrix which is scaled
      // for custom layers using mercator coordinates [0..1]
      camera.setProjectionMatrix(args.defaultProjectionData.mainMatrix);
      camera.modified();

      openglRenderWindow.renderShared();
    },
  };

  map.addLayer(vtkLayer);
}

init();
