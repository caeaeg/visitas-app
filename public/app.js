/**
 * APP.JS - Lógica de Control y Conexión con la API
 * Sistema de Gestión de Territorios y Visitas
 */
// --- VARIABLES GLOBALES DEL NAVEGADOR ---
let paginaActual = 1;
let currentDept = null;
let currentUser = null;
let currentRole = null;
let currentBuildingId = null;

let leafletMap = null;
let leafletMarker = null;


// --- FUNCIONES DE NAVEGACIÓN Y VISTAS ---

function abrirVista(id) {
  // Ocultar todas las vistas
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  
  // Activar la vista objetivo
  const vistaObjetivo = document.getElementById(id);
  if (vistaObjetivo) vistaObjetivo.classList.add("active");

  // Acciones específicas según la vista
  if (id === "territorioView") {
    cargarDashboard();
    
    // Si el mapa ya existe, forzamos re-cálculo de tamaño para evitar el bug gris de Leaflet
    if (leafletMap) {
      setTimeout(() => {
        leafletMap.invalidateSize();
      }, 100);
    } else {
      // Centrar mapa por defecto en Posadas al abrir territorios de cero
      inicializarMapaLeaflet(-27.36708, -55.89608, "Posadas");
    }
  }
  if (id === "editarView") {
    // Si se abre vacía, es para listar o rellenar con el editor
  }
  if (id === "problemasView") {
    verProblemas();
  }
}


// --- FUNCIÓN CENTRAL DE PETICIONES HTTP (API FETCH NATIVA) ---

async function apiFetch(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    "x-user": currentUser,
    "x-role": currentRole
  };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    logout();
    alert("Sesión expirada");
  }
  if (response.status === 403) {
    alert("No tenés permisos");
  }
  return response;
}

function tienePermiso(roles) {
  return roles.includes(currentRole);
}


// --- SISTEMA DE AUTENTICACIÓN (LOGIN / LOGOUT) ---

async function login() {
  const username = loginUser.value.trim();
  const password = loginPass.value.trim();
  loginMsg.innerText = "";

  if (!username || !password) {
    loginMsg.innerText = "Completá usuario y contraseña";
    return;
  }

  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    
    if (!data.ok) {
      loginMsg.innerText = data.message || "Usuario o contraseña incorrectos";
      return;
    }

    currentUser = data.username;
    currentRole = data.role;
    localStorage.setItem("user", data.username);
    localStorage.setItem("role", data.role);
    
    iniciarApp();
  } catch (error) {
    console.error("Error en login:", error);
    loginMsg.innerText = "Error al conectar con el servidor";
  }
}

function iniciarApp() {
  loginScreen.style.display = "none";
  aplicarPermisos();
  
  // Redirección según rol (predi = móvil, admin/conductor = panel de control)
  if (currentRole === "predi") {
    appContainer.style.display = "block";
    mainDashboard.style.display = "none";
  } else {
    mainDashboard.style.display = "block";
    appContainer.style.display = "none";
    abrirVista("dashboardView");
  }
}

function logout() {
  localStorage.removeItem("user");
  localStorage.removeItem("role");
  location.reload();
}

function aplicarPermisos() {
  sidebar.style.display = "none";
  const btnProblemas = document.querySelector('#dashboardView [onclick="abrirVista(\'problemasView\')"]');

  if (currentRole === "admin") {
    sidebar.style.display = "flex";
    if (btnProblemas) btnProblemas.style.display = "block";
  }
  if (currentRole === "conductor") {
    sidebar.style.display = "flex";
    if (btnProblemas) btnProblemas.style.display = "none";
  }
  if (currentRole === "predi") {
    sidebar.style.display = "none";
  }
}

// Oidor de carga inicial de la página
window.addEventListener("load", async () => {
  const savedUser = localStorage.getItem("user");
  const savedRole = localStorage.getItem("role");
  
  if (savedUser && savedRole) {
    currentUser = savedUser;
    currentRole = savedRole;
    iniciarApp();
  }
  
  // Soporte para links directos QR o parámetros (?building=ID)
  const params = new URLSearchParams(window.location.search);
  const buildingIdParam = params.get("building");
  if (buildingIdParam) {
    currentBuildingId = buildingIdParam;
    mensajeInicial.style.display = "none";
    await cargarDepto();
  }
});


// --- MÓDULO PREDICADORES (VISTA MÓVIL) ---

async function buscar() {
  limpiarVista();
  const input = normalizarDireccion(buildingId.value);
  if (!input) return;
  
  mensajeInicial.style.display = "none";
  resultado.innerText = "Buscando...";

  try {
    const b = await apiFetch(`/building/${encodeURIComponent(input)}`);
    const building = await b.json();
    
    if (!building || !building._id) {
      resultado.innerText = "Edificio no encontrado";
      if (tienePermiso(["admin", "conductor"])) {
        btnNuevoEdificio.style.display = "block";
      }
      return;
    }
    
    currentBuildingId = building._id;
    await cargarDepto();
  } catch (error) {
    console.error(error);
    resultado.innerText = "Error al buscar el edificio";
  }
}

async function buscarPorTerritorio() {
  limpiarVista();
  const territorio = prompt("Número de territorio:");
  if (!territorio) return;

  try {
    const res = await apiFetch(`/territory/${territory}`);
    const data = await res.json();
    
    if (!data.length) {
      listaTerritorio.innerHTML = "<p style='text-align:center;'>No hay edificios asignados</p>";
      return;
    }
    
    listaTerritorio.innerHTML = "";
    data.forEach(b => {
      const btn = document.createElement("button");
      btn.innerText = b.address;
      btn.onclick = () => {
        currentBuildingId = b._id;
        cargarDepto();
      };
      listaTerritorio.appendChild(btn);
    });
  } catch (error) {
    console.error(error);
  }
}

async function cargarDepto() {
  try {
    const res = await apiFetch(`/next/${currentBuildingId}`);
    const data = await res.json();
    
    listaTerritorio.innerHTML = "";

    if (data.message === "NO_AVAILABLE" || !data.dept) {
      resultado.innerText = "No hay departamentos disponibles o terminaste el edificio";
      nota.style.display = "none";
      btnOk.style.display = "none";
      btnNo.style.display = "none";
      btnSiguiente.style.display = "none";
      await mostrarInfoEdificio();
      return;
    }

    currentDept = data.dept;
    resultado.innerHTML = `
      <div style="margin-top:18px; text-align:center;">
        <div style="font-size:18px; color:#9e9e9e; margin-bottom:10px;">Departamento</div>
        <div style="font-size:72px; font-weight:bold; color:white; line-height:1; text-shadow: 0 5px 20px rgba(0,0,0,.35);">${data.dept.number}</div>
      </div>
    `;
    
    nota.style.display = "block";
    btnOk.style.display = "block";
    btnNo.style.display = "block";
    reportBtn.style.display = "block";
    btnOk.disabled = false;
    btnNo.disabled = false;
    btnSiguiente.style.display = "none";
    
    await mostrarInfoEdificio();
  } catch (error) {
    console.error(error);
    resultado.innerText = "Error al cargar el departamento";
  }
}

async function mostrarInfoEdificio() {
  try {
    const res = await apiFetch(`/building-info/${currentBuildingId}`);
    const data = await res.json();
    
    infoEdificio.style.display = "block";
    infoEdificio.innerHTML = `
      <div class="sectionCard">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
          <div>
            <div style="font-size:24px; font-weight:bold; color:white;">${data.building.address}</div>
            <div style="color:#9e9e9e; margin-top:4px;">${data.building.address2 || ""}</div>
          </div>
          <div style="background:#2b2b2b; padding:8px 12px; border-radius:12px; font-size:13px;">🏢 ${data.building.name || "Edificio"}</div>
        </div>
        <div style="margin-top:18px; display:flex; gap:12px; flex-wrap:wrap;">
          <div style="background:#222; padding:10px 14px; border-radius:14px;">🕒 Última visita: ${data.lastVisit ? new Date(data.lastVisit.date).toLocaleDateString() : "Nunca"}</div>
          ${data.issue ? `<div style="background:#3a1f1f; color:#ff8a80; padding:10px 14px; border-radius:14px;">⚠ ${data.issue.description || data.issue.type}</div>` : ""}
        </div>
      </div>
    `;
    
    if (data.issue) {
      reportBtn.classList.add("alerta");
    } else {
      reportBtn.classList.remove("alerta");
    }
  } catch (error) {
    console.error(error);
  }
}

async function marcar(status) {
  if (!currentDept) return;
  btnOk.disabled = true;
  btnNo.disabled = true;
  
  try {
    await apiFetch("/visit", {
      method: "POST",
      body: JSON.stringify({
        departmentId: currentDept._id,
        status: status,
        note: nota.value
      })
    });
    
    btnSiguiente.style.display = "block";
  } catch (error) {
    console.error(error);
    btnOk.disabled = false;
    btnNo.disabled = false;
  }
}

async function siguiente() {
  nota.value = "";
  await cargarDepto();
}


// --- MÓDULO REPORTES DE PROBLEMAS ---

function abrirReporte() { modalReporte.style.display = "flex"; }
function cerrarReporte() { modalReporte.style.display = "none"; }

async function enviarReporte() {
  try {
    await apiFetch("/issues", {
      method: "POST",
      body: JSON.stringify({
        buildingId: currentBuildingId,
        departmentId: currentDept?._id,
        type: tipoProblema.value,
        description: descProblema.value
      })
    });
    cerrarReporte();
    descProblema.value = "";
    alert("Reporte enviado con éxito");
    await mostrarInfoEdificio();
  } catch (error) {
    console.error(error);
  }
}

async function verProblemas() {
  try {
    const res = await apiFetch("/issues");
    const data = await res.json();
    let html = "";
    
    if(!data.length) {
      html = "<p style='padding:15px; color:gray;'>No hay problemas reportados pendientes.</p>";
    }

    data.forEach(i => {
      html += `
        <div class="card-container" style="margin-bottom:10px;">
          <b style="color:#ff8a80;">⚠️ ${i.type}</b><br>
          <small style="color:gray;">Edificio ID: ${i.buildingId}</small><br>
          <p style="margin-top:5px;">${i.description || "Sin descripción"}</p>
        </div>
      `;
    });
    
    const probView = document.getElementById("problemasView");
    probView.innerHTML = `
      <button class="secondary backModern" onclick="abrirVista('dashboardView')">← Volver</button>
      <h2>⚠ Problemas Reportados</h2>
      ${html}
    `;
  } catch (error) {
    console.error(error);
  }
}


// --- MÓDULO ADMINISTRACIÓN (ESTADÍSTICAS Y TABLAS) ---

async function cargarDashboard() {
  try {
    const res = await apiFetch("/stats");
    const data = await res.json();
    totalEdificios.innerText = data.totalEdificios || 0;
    visitados.innerText = data.visitados || 0;
  } catch (error) {
    console.error(error);
  }
}

async function cargarEdificios() {
  listaEdificios.innerHTML = `
    <div class="card-container skeleton">
      <div class="skeletonLine"></div>
      <div class="skeletonLine"></div>
      <div class="skeletonLine"></div>
    </div>
  `;
  
  const filtro = busquedaTerritorio.value;
  const orden = filtroOrden.value;
  
  try {
    const res = await apiFetch(`/admin/buildings?page=${paginaActual}&limit=20&territory=${filtro}&sort=${orden}`);
    const data = await res.json();
    let html = "";
    
    if(!data.data || data.data.length === 0) {
      listaEdificios.innerHTML = "<p style='color:gray; text-align:center;'>No se encontraron edificios.</p>";
      return;
    }
    
    data.data.forEach(b => {
      const addrEscaped = b.address.replace(/'/g, "\\'");
      html += `
        <div class="card-container" style="margin-top:12px;">
          <b>${b.address}</b><br>
          🗺 Territorio: ${b.territory || "-"}<br><br>
          <div style="display:flex; gap:8px;">
            <button class="buscar" style="min-height:40px; padding:8px;" onclick="inicializarMapaLeaflet(${b.latitude || null}, ${b.longitude || null}, '${addrEscaped}')">👁 Ver Mapa</button>
            <button class="secondary" style="min-height:40px; padding:8px;" onclick='abrirEditorEdificio(${JSON.stringify(b)})'>✏ Editar</button>
          </div>
        </div>
      `;
    });
    listaEdificios.innerHTML = html;
  } catch (error) {
    console.error(error);
    listaEdificios.innerHTML = "<p style='color:red;'>Error al cargar el listado.</p>";
  }
}

function paginaAnterior() {
  if (paginaActual > 1) {
    paginaActual--;
    cargarEdificios();
  }
}

function paginaSiguiente() {
  paginaActual++;
  cargarEdificios();
}

async function buscarTerritorioAdmin() {
  const t = territorioAdminInput.value.trim();
  if (!t) return;
  
  territorioResultados.innerHTML = `
    <div class="card-container skeleton">
      <div class="skeletonLine"></div>
      <div class="skeletonLine"></div>
    </div>
  `;
  
  try {
    const res = await apiFetch(`/territory/${t}`);
    const data = await res.json();
    let html = "";
    
    if(!data.length) {
      territorioResultados.innerHTML = "<p style='color:gray;'>Este territorio no tiene edificios cargados.</p>";
      return;
    }

    data.forEach(b => {
      const addrEscaped = b.address.replace(/'/g, "\\'");
      html += `
        <div class="card-container" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <b>${b.address}</b><br>
            🗺 Territorio N° ${b.territory || "-"}
          </div>
          <button class="buscar" style="width:auto; min-height:40px; padding:10px;" onclick="inicializarMapaLeaflet(${b.latitude || null}, ${b.longitude || null}, '${addrEscaped}')">🗺️ Ver</button>
        </div>
      `;
    });
    territorioResultados.innerHTML = html;
    
    if (data.length > 0 && data[0].latitude && data[0].longitude) {
      inicializarMapaLeaflet(data[0].latitude, data[0].longitude, data[0].address);
    }
  } catch (error) {
    console.error(error);
  }
}

async function verListado() {
  abrirVista("editarView"); 
  try {
    const res = await apiFetch("/admin/buildings");
    const result = await res.json();
    let html = "";
    
    result.data.forEach(b => {
      html += `
        <div class="card-container" style="margin-bottom:10px;">
          <b>${b.address}</b><br>
          Territorio: ${b.territory || "-"}<br><br>
          <button class="secondary" onclick='abrirEditorEdificio(${JSON.stringify(b)})'>✏ Editar</button>
        </div>
      `;
    });
    
    document.getElementById("editarView").innerHTML = `
      <button class="secondary backModern" onclick="abrirVista('dashboardView')">← Volver</button>
      <h2>🏢 Edificios Totales</h2>
      ${html}
    `;
  } catch (error) {
    console.error(error);
  }
}


// --- ENVIAR NUEVO EDIFICIO O MODIFICACIONES ---

async function guardarEdificio(id = null) {
  const payload = {
    address: document.getElementById("edit_address").value,
    address2: document.getElementById("edit_address2").value,
    name: document.getElementById("edit_name").value,
    territory: document.getElementById("edit_territory").value,
    floors: parseInt(document.getElementById("edit_floors").value) || 0,
    unitsPerFloor: parseInt(document.getElementById("edit_units").value) || 0,
    latitude: parseFloat(document.getElementById("edit_lat").value) || null,
    longitude: parseFloat(document.getElementById("edit_lng").value) || null,
    hasGroundFloor: document.getElementById("edit_pb").checked,
    hasDoorman: document.getElementById("edit_portero").checked,
    description: document.getElementById("edit_description").value
  };

  const url = id ? `/admin/building/${id}` : "/admin/building";
  const method = id ? "PUT" : "POST";

  try {
    const res = await apiFetch(url, {
      method: method,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    if(res.ok) {
      alert("Edificio guardado exitosamente");
      abrirVista("dashboardView");
    } else {
      alert("Error: " + data.message);
    }
  } catch (error) {
    console.error(error);
    alert("Error crítico en comunicación con servidor.");
  }
}

function crearEdificio() {
  if (!tienePermiso(["admin", "conductor"])) {
    alert("No tenés permisos");
    return;
  }
  abrirEditorEdificio();
}


// --- AUXILIARES Y LIMPIEZA DE INTERFAZ ---

function normalizarDireccion(dir) {
  return dir
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bav\b|\bav\.\b/g, "avenida")
    .replace(/\bgral\b/g, "general")
    .replace(/\bdr\b|\bdr\.\b/g, "doctor")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function limpiarVista() {
  listaTerritorio.innerHTML = "";
  resultado.innerText = "";
  infoEdificio.style.display = "none";
  nota.style.display = "none";
  btnOk.style.display = "none";
  btnNo.style.display = "none";
  btnSiguiente.style.display = "none";
  btnNuevoEdificio.style.display = "none";
  reportBtn.style.display = "none";
}


// 🗺️ FUNCIÓN ENCARGADA DE INYECTAR MAPAS Y CAPAS GEOJSON
function inicializarMapaLeaflet(lat, lng, address = "Edificio") {
  const defaultLat = -27.36708; // Posadas, Misiones
  const defaultLng = -55.89608;
  
  const mapaLat = lat || defaultLat;
  const mapaLng = lng || defaultLng;

  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
    leafletMarker = null;
  }

  setTimeout(() => {
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;

    leafletMap = L.map('map').setView([mapaLat, mapaLng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(leafletMap);

    // DIBUJAR LOS POLÍGONOS DE TERRITORIOS CARGADOS DESDE TERRITORIOS.JS
    if (typeof misTerritoriosGeoJSON !== 'undefined') {
      L.geoJSON(misTerritoriosGeoJSON, {
        style: function(feature) {
          return {
            color: "#e67e22",       
            weight: 2,              
            opacity: 0.8,
            fillColor: "#f39c12",   
            fillOpacity: 0.2        
          };
        },
        onEachFeature: function (feature, layer) {
          if (feature.properties && feature.properties.Territorio_N) {
            layer.bindPopup(`<b>Territorio N° ${feature.properties.Territorio_N}</b>`);
          }
          layer.on('mouseover', function () { this.setStyle({ fillOpacity: 0.5 }); });
          layer.on('mouseout', function () { this.setStyle({ fillOpacity: 0.2 }); });
        }
      }).addTo(leafletMap);
    }

    // Agregar marcador único si se pasan coordenadas válidas
    if (lat && lng) {
      leafletMarker = L.marker([lat, lng]).addTo(leafletMap)
        .bindPopup(`<b>${address}</b>`)
        .openPopup();
    }
  }, 50);
}


// 📐 EDITOR DINÁMICO COMPLETO CON CAPTURA VISUAL DE COORDENADAS
function abrirEditorEdificio(building = null) {
  abrirVista("editarView");
  
  let html = `
    <div class="card-container">
      <h3>${building ? "✏ Editar edificio" : "➕ Nuevo edificio"}</h3>
      <input id="edit_address" placeholder="Dirección" value="${building?.address || (document.getElementById('buildingId')?.value || '')}">
      <input id="edit_address2" placeholder="Dirección 2" value="${building?.address2 || ''}">
      <input id="edit_name" placeholder="Nombre" value="${building?.name || ''}">
      <input id="edit_territory" placeholder="Territorio" value="${building?.territory || ''}">
      <input id="edit_floors" type="number" placeholder="Pisos" value="${building?.floors || ''}">
      <input id="edit_units" type="number" placeholder="Deptos por piso" value="${building?.unitsPerFloor || ''}">
      <input type="hidden" id="edit_lat" value="${building?.latitude || ''}">
      <input type="hidden" id="edit_lng" value="${building?.longitude || ''}">
      <label><input type="checkbox" id="edit_pb" ${building?.hasGroundFloor ? 'checked' : ''}> Planta baja</label>
      <label><input type="checkbox" id="edit_portero" ${building?.hasDoorman ? 'checked' : ''}> Portero</label>
      <textarea id="edit_description" placeholder="Descripción">${building?.description || ''}</textarea>
      <p style="font-size:14px; margin-top:10px; color:#bdbdbd;">📍 Tocá el mapa para ubicar o corregir el edificio:</p>
      
      <div id="map-editor" class="mapaBox" style="height:250px; margin-bottom:15px;"></div>
      
      <button class="ok" onclick='${building ? `guardarEdificio("${building._id}")` : `guardarEdificio()`}'>💾 Guardar</button>
    </div>
  `;
  
  document.getElementById("editarView").innerHTML = `
    <button class="secondary backModern" onclick="abrirVista('dashboardView')">← Volver</button>
    ${html}
  `;

  // Inicializar sub-mapa de coordenadas usando su contenedor propio
  setTimeout(() => {
    const defaultLat = -27.36708;
    const defaultLng = -55.89608;
    const initLat = building?.latitude || defaultLat;
    const initLng = building?.longitude || defaultLng;

    if (leafletMap) {
      leafletMap.remove();
      leafletMap = null;
      leafletMarker = null;
    }

    leafletMap = L.map('map-editor').setView([initLat, initLng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(leafletMap);

    if (building?.latitude && building?.longitude) {
      leafletMarker = L.marker([initLat, initLng]).addTo(leafletMap);
    }

    leafletMap.on('click', function(e) {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      document.getElementById('edit_lat').value = lat;
      document.getElementById('edit_lng').value = lng;
      
      if (leafletMarker) {
        leafletMarker.setLatLng(e.latlng);
      } else {
        leafletMarker = L.marker(e.latlng).addTo(leafletMap);
      }
    });
  }, 50);
}
