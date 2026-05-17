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
let prediMiniMap = null; 
let leafletMap = null;
let leafletMarker = null;
let miTemporizadorMapa = null; // Guardián para que no se pisen los clics de los edificios

function abrirVista(id) {
  // Ocultar todas las sub-vistas internas
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  
  // Activar la sub-vista objetivo
  const vistaObjetivo = document.getElementById(id);
  if (vistaObjetivo) vistaObjetivo.classList.add("active");
  // --- SOLUCIÓN DE FLUJO DE CONTENEDORES ---
  if (id === "editarView" && currentRole === "predi") {
    // Si el predi va a editar/crear, ocultamos su buscador móvil
    document.getElementById("appContainer").style.display = "none";
    // Y mostramos temporalmente el contenedor padre del editor, ocultando su barra superior de admin
    document.getElementById("mainDashboard").style.display = "block";
    const topbar = document.querySelector(".topbar");
    if (topbar) topbar.style.display = "none"; 
  }
  // Acciones específicas según la vista
  if (id === "territorioView") {
    cargarDashboard();
    cargarEdificios(); 
    // Si el mapa ya existe, forzamos re-cálculo de tamaño para evitar el bug gris de Leaflet
    if (leafletMap) {
      setTimeout(() => {
        leafletMap.invalidateSize();
      }, 100);
    } else {
      // Centrar mapa por defecto en Posadas al abrir territorios de cero
      inicializarMapaLeaflet(-27.36708, -55.89608);
    }
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
    const topbar = document.querySelector(".topbar");
    if (topbar) topbar.style.display = "flex"; // Nos aseguramos de restaurarla para el admin
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


async function buscar() {
  limpiarVista();
  const input = normalizarDireccion(buildingId.value);
  if (!input) return;
  
  mensajeInicial.style.display = "none";
  resultado.innerText = "Buscando...";

  try {
    const b = await apiFetch(`/building/${encodeURIComponent(input)}`);
    
    // --- NUEVA VALIDACIÓN ADAPTADA PARA MANEJAR EL 404 DEL SERVIDOR ---
    if (!b.ok) {
      if (b.status === 404) {
        resultado.innerText = "Edificio no encontrado";
        btnNuevoEdificio.style.display = "block";
        btnNuevoEdificio.onclick = function() {
          crearEdificio();
        };
        return;
      }
      throw new Error(`Error en servidor: ${b.status}`);
    }
    const building = await b.json();
    if (!building || !building._id) {
      resultado.innerText = "Edificio no encontrado";
      btnNuevoEdificio.style.display = "block";
      btnNuevoEdificio.onclick = function() {
        crearEdificio();
      };
      return;
    }
    currentBuildingId = building._id;
    await cargarDepto();
    } catch (error) {
    console.error("Detalle del error en buscar:", error);
    // Si la API falló con 404 pero saltó al catch por el fetch nativo, también le damos la opción de crear
    resultado.innerText = "Edificio no encontrado o error de red";
    btnNuevoEdificio.style.display = "block";
    btnNuevoEdificio.onclick = function() {
      crearEdificio();
    };
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
    const b = data.building;

    infoEdificio.style.display = "block";
    infoEdificio.innerHTML = `
      <div class="sectionCard">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
          <div>
            <div style="font-size:24px; font-weight:bold; color:white;">${b.address}</div>
            <div style="color:#9e9e9e; margin-top:4px;">${b.address2 || ""}</div>
          </div>
          <div style="background:#2b2b2b; padding:8px 12px; border-radius:12px; font-size:13px;">🏢 ${b.name || "Edificio"}</div>
        </div>
        <div id="miniMapaPredi" class="mapaBox" style="display:none; height: 160px; margin-top:15px; border-radius:12px; pointer-events: none; border: 1px solid #333;"></div>
        <div style="margin-top:18px; display:flex; gap:12px; flex-wrap:wrap;">
          <div style="background:#222; padding:10px 14px; border-radius:14px;">🕒 Última visita: ${data.lastVisit ? new Date(data.lastVisit.date).toLocaleDateString() : "Nunca"}</div>
          ${data.issue ? `<div style="background:#3a1f1f; color:#ff8a80; padding:10px 14px; border-radius:14px;">⚠ ${data.issue.description || data.issue.type}</div>` : ""}
        </div>
      </div>
    `;

    // Manejo del botón de reporte
    if (data.issue) reportBtn.classList.add("alerta");
    else reportBtn.classList.remove("alerta");

    const miniMapaDiv = document.getElementById("miniMapaPredi");

    if (b && (b.territory || (b.latitude && b.longitude))) {
      miniMapaDiv.style.display = "block";

      if (prediMiniMap) {
        prediMiniMap.remove();
        prediMiniMap = null;
      }

      prediMiniMap = L.map('miniMapaPredi', {
        zoomControl: false,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(prediMiniMap);

      let centradoExitoso = false;

      // 1. DIBUJAR TERRITORIO (Como fondo)
      if (b.territory && typeof misTerritoriosGeoJSON !== 'undefined') {
        let capaGeoJSON = L.geoJSON(misTerritoriosGeoJSON, {
          filter: (f) => String(f.properties.name || f.properties.Territorio_N) === String(b.territory),
          style: { color: '#2196F3', weight: 2, fillColor: '#2196F3', fillOpacity: 0.15 }
        }).addTo(prediMiniMap);

        if (capaGeoJSON.getLayers().length > 0) {
          prediMiniMap.fitBounds(capaGeoJSON.getBounds(), { padding: [20, 20] });
          centradoExitoso = true;
        }
      }

      // 2. AGREGAR MARCADOR (Con validación y re-centrado)
      if (b.latitude && b.longitude) {
        const lat = parseFloat(b.latitude);
        const lng = parseFloat(b.longitude);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          L.marker([lat, lng]).addTo(prediMiniMap);
          
          // Si hay marcador, forzamos la vista sobre él, incluso si hay territorio
          // Esto asegura que el punto sea el protagonista
          prediMiniMap.setView([lat, lng], 16); 
          centradoExitoso = true;
        }
      }

      if (!centradoExitoso) {
        prediMiniMap.setView([-27.36708, -55.89608], 14);
      }

      setTimeout(() => { if (prediMiniMap) prediMiniMap.invalidateSize(); }, 200);
    } else {
      miniMapaDiv.style.display = "none";
    }
  } catch (error) {
    console.error("Error en mostrarInfoEdificio:", error);
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
  // 1. Validar que el usuario haya escrito algo antes de enviar
  const descripcion = descProblema.value.trim();
  if (!descripcion) {
    alert("Por favor, escribe los detalles del problema antes de enviar.");
    return;
  }

  try {
    // Apuntamos a la ruta "/issues" que ya tenías definida
    const res = await apiFetch("/issues", {
      method: "POST",
      body: JSON.stringify({
        buildingId: currentBuildingId,
        departmentId: currentDept?._id || null, // Aseguramos un null si no hay depto
        type: tipoProblema.value,
        description: descripcion
      })
    });

    // 2. Controlar si el servidor realmente aceptó el reporte
    if (res.ok) {
      cerrarReporte();
      descProblema.value = "";
      alert("Reporte enviado con éxito");
      await mostrarInfoEdificio();
    } else {
      // Intentamos leer el mensaje de error del servidor si existe
      const errorData = await res.json().catch(() => ({}));
      alert("No se pudo enviar el reporte: " + (errorData.error || "Error en el servidor"));
    }

  } catch (error) {
    console.error("Error crítico al enviar reporte:", error);
    alert("Error crítico de comunicación. Revisa tu conexión.");
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
    </div>
  `;
  
  // 1. Capturamos todos los filtros disponibles
  const filtroTerritorio = busquedaTerritorio.value.trim();
  const orden = filtroOrden.value;
  
  // 2. Capturamos el nuevo buscador por dirección (asegúrate de que el ID coincida con tu HTML)
  const inputDireccion = document.getElementById("busquedaDireccionAdmin");
  const filtroDireccion = inputDireccion ? inputDireccion.value.trim() : "";
  
  try {
    // 3. Enviamos TODO al servidor: territorio, búsqueda por nombre/dirección y el orden
    const res = await apiFetch(`/admin/buildings?page=${paginaActual}&limit=20&territory=${filtroTerritorio}&search=${encodeURIComponent(filtroDireccion)}&sort=${orden}`);
    const data = await res.json();
    let html = "";

    if(!data.data || data.data.length === 0) {
      listaEdificios.innerHTML = "<p style='color:gray; text-align:center; padding:20px;'>No se encontraron edificios con esos filtros.</p>";
      return;
    }

    data.data.forEach(b => {
      // Usamos una lógica de color para resaltar si es nuevo (opcional)
      const colorBorde = (orden === 'recent') ? '#4CAF50' : '#2196F3';
      
      html += `
        <div class="card-container" style="margin-top:10px; cursor:pointer; border-left: 4px solid ${colorBorde};" onclick="verDetalleEdificioAdmin('${b._id}')">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <b style="color:white; font-size:16px;">${b.address}</b><br>
              <small style="color:gray;">🗺️ Territorio: ${b.territory || "-"}</small>
            </div>
            <span style="font-size:14px; color:#2196F3;">👁️ Ver</span>
          </div>
        </div>
      `;
    });
    listaEdificios.innerHTML = html;
  } catch (error) {
    console.error("Error en cargarEdificios:", error);
    listaEdificios.innerHTML = "<p style='color:red; text-align:center;'>Error al cargar el listado.</p>";
  }
}

// Nueva función centralizada para auditar un edificio (Detalles, Alertas, Historial y Editar)
async function verDetalleEdificioAdmin(buildingId) {
  const panel = document.getElementById("panelDetalleEdificio");
  panel.style.display = "block";
  panel.innerHTML = `<p style="text-align:center; color:gray;">Cargando historial y detalles...</p>`;

  try {
    // Reutilizamos tu ruta de información que ya trae datos del edificio y problemas
    const res = await apiFetch(`/building-info/${buildingId}`);
    const data = await res.json();
    const b = data.building;
    const addrEscaped = b.address.replace(/'/g, "\\'");

    // Comprobar si hay alertas de problemas activos
    let alertaHtml = "";
    if (data.issue) {
      alertaHtml = `
        <div style="background:#3a1f1f; border: 1px solid #f44336; color:#ff8a80; padding:12px; border-radius:12px; margin-bottom:15px; font-size:15px;">
          ⚠️ <b>Problema Reportado (${data.issue.type}):</b> ${data.issue.description || "Sin descripción adicional"}
        </div>
      `;
    }

    // Renderizamos todo el bloque consolidado primero para asegurar el HTML en pantalla
    panel.innerHTML = `
      ${alertaHtml}
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
        <div>
          <h3 style="margin:0; color:white; font-size:22px;">${b.address}</h3>
          <p style="color:gray; margin:2px 0;">${b.address2 || ""}</p>
        </div>
        <button class="secondary" style="width:auto; min-height:38px; padding:6px 12px; font-size:14px; border-radius:8px;" onclick='abrirEditorEdificio(${JSON.stringify(b)})'>✏️ Editar</button>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:14px; background:#252525; padding:12px; border-radius:12px; margin-bottom:15px;">
        <div>🏢 <b>Nombre:</b> ${b.name || "-"}</div>
        <div>🗺️ <b>Territorio:</b> ${b.territory || "-"}</div>
        <div>🔢 <b>Pisos:</b> ${b.floors || 0}</div>
        <div>🚪 <b>Deptos/Piso:</b> ${b.unitsPerFloor || 0}</div>
        <div>🌱 <b>Planta Baja:</b> ${b.hasGroundFloor ? "Sí" : "No"}</div>
        <div>🛎️ <b>Portero:</b> ${b.hasDoorman ? "Sí" : "No"}</div>
      </div>
      <h4 style="margin:10px 0 5px; color:#2196F3; font-size:16px;">🕒 Historial de Visitas e Información</h4>
      <div style="font-size:14px; background:#181818; padding:10px; border-radius:10px; max-height:180px; overflow-y:auto; border:1px solid #2b2b2b;">
        <p style="margin:0; color:#bdbdbd;">Última visita registrada: ${data.lastVisit ? new Date(data.lastVisit.date).toLocaleDateString() : "Nunca"}</p>
        ${b.description ? `<p style="margin-top:8px; color:gray;"><b>Descripción interna:</b> ${b.description}</p>` : ""}
      </div>
    `;

   // --- 🗺️ MOVIMIENTO DE CÁMARA INTELIGENTE, CERCANO Y ANTI-SOLAPAMIENTO ---
    // Frenamos cualquier animación o movimiento que haya quedado colgado del clic anterior
    if (miTemporizadorMapa) {
      clearTimeout(miTemporizadorMapa);
    }

    miTemporizadorMapa = setTimeout(() => {
      const miMapaReal = (typeof leafletMap !== 'undefined' && leafletMap !== null) ? leafletMap : 
                         (typeof map !== 'undefined' && map !== null) ? map : null;

      if (miMapaReal) {
        // Despertamos los cuadraditos del mapa
        miMapaReal.invalidateSize({ animate: false });

        const latValida = parseFloat(b.latitude);
        const lngValida = parseFloat(b.longitude);
        
        // ¿Tiene coordenadas reales y válidas?
        const tieneCoordenadas = !isNaN(latValida) && !isNaN(lngValida) && isFinite(latValida) && latValida !== 0;

        if (tieneCoordenadas) {
          // 📍 CASO A: EL EDIFICIO TIENE PUNTO EXACTO
          console.log(`📍 Ejecutando marcador y vuelo para: ${latValida}, ${lngValida}`);
          
          // 1. Primero llamamos a tu función para que ponga el pin en el mapa de forma segura
          if (typeof inicializarMapaLeaflet === 'function') {
            try {
              inicializarMapaLeaflet(latValida, lngValida, addrEscaped);
            } catch (e) {
              console.warn("Aviso en inicializarMapaLeaflet:", e);
            }
          }

          // 2. Esperamos 100 milisegundos a que tu función termine de tocar el mapa...
          setTimeout(() => {
            try {
              console.log("🚀 Disparando vuelo final con Zoom 18...");
              miMapaReal.invalidateSize();
              
              // ...y ahí le clavamos el zoomazo definitivo sin que nada lo pise
              miMapaReal.flyTo([latValida, lngValida], 18, {
                animate: true,
                duration: 0.6
              });
            } catch (flyError) {
              console.error("Error en el flyTo diferido:", flyError);
            }
          }, 100);

        } else if (b.territory && typeof misTerritoriosGeoJSON !== 'undefined' && misTerritoriosGeoJSON !== null) {
          // 🗺️ CASO B: NO TIENE COORDENADAS (Ir al territorio con zoom más cercano)
          try {
            let capaGeoJSONAdmin = L.geoJSON(misTerritoriosGeoJSON, {
              filter: function(feature) {
                const numeroTerritorio = feature.properties && (feature.properties.name || feature.properties.Territorio_N);
                return String(numeroTerritorio) === String(b.territory);
              }
            });

            if (capaGeoJSONAdmin.getLayers().length > 0) {
              console.log(`🗺️ [Territorio] Encuadrando de cerca en el Territorio ${b.territory}`);
              
              // Modificamos el padding a 15 para que el mapa se pegue bien a los bordes del barrio y se vea más cerca
              miMapaReal.fitBounds(capaGeoJSONAdmin.getBounds(), { 
                padding: [15, 15], 
                maxZoom: 16 // Forzamos un zoom 16 para que no quede alejado de fondo
              });
            }
          } catch (geoError) {
            console.warn("Fallo al encuadrar territorio:", geoError);
          }
        } else {
          // 🏙️ CASO C: SIN NINGÚN DATO (Posadas General)
          miMapaReal.setView([-27.36708, -55.89608], 14);
        }

      } else {
        console.warn("⚠️ No se encontró la variable del mapa.");
      }
    }, 100); // Bajamos el delay a 100ms porque al limpiar el anterior ya no hace falta esperar tanto

  } catch (error) {
    console.error("Error al cargar detalles del edificio:", error);
    panel.innerHTML = `<p style="color:red; text-align:center;">Error al conectar con los detalles del edificio.</p>`;
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

  const url = id ? `/building/${id}` : "/building";
  const method = id ? "PUT" : "POST";

  try {
    const res = await apiFetch(url, {
      method: method,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    if(res.ok) {
      alert("Edificio guardado exitosamente");
      // Si es predi, simula una cancelación para regresar limpio a la vista móvil, sino va al dashboard
      if (currentRole === "predi") {
        cancelarEdificioMovil();
      } else {
        abrirVista("dashboardView");
      }
    } else {
      alert("Error: " + data.message);
    }
  } catch (error) {
    console.error(error);
    alert("Error crítico en comunicación con servidor.");
  }
}

function crearEdificio() {
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
  const miniMapaDiv = document.getElementById("miniMapaPredi");
  if (miniMapaDiv) miniMapaDiv.style.display = "none";
  if (prediMiniMap) {
    prediMiniMap.remove();
    prediMiniMap = null;
  }
}


// 🗺️ FUNCIÓN ENCARGADA DE INYECTAR MAPAS Y CAPAS GEOJSON (Corregida sin carteles molestos y con números elegantes)
function inicializarMapaLeaflet(lat, lng, address = null) {
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

    // Función auxiliar para generar un color pastel aleatorio en formato HEX
    function generarColorPastelAleatorio() {
      const r = Math.floor((Math.random() * 127) + 128).toString(16).padStart(2, '0');
      const g = Math.floor((Math.random() * 127) + 128).toString(16).padStart(2, '0');
      const b = Math.floor((Math.random() * 127) + 128).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }

    // DIBUJAR LOS POLÍGONOS DE TERRITORIOS CARGADOS DESDE TERRITORIOS.JS
    if (typeof misTerritoriosGeoJSON !== 'undefined') {
      L.geoJSON(misTerritoriosGeoJSON, {
        style: function(feature) {
          const colorAleatorio = generarColorPastelAleatorio();
          return {
            color: colorAleatorio,       // Color del borde
            weight: 2,                   // Grosor del borde
            opacity: 0.9,
            fillColor: colorAleatorio,   // Color del relleno pastel
            fillOpacity: 0.35            
          };
        },
        onEachFeature: function (feature, layer) {
          const numeroTerritorio = feature.properties && (feature.properties.name || feature.properties.Territorio_N);
          
          if (numeroTerritorio) {
            // 1. Popup normal al hacerle clic al polígono
            layer.bindPopup(`<b>Territorio N° ${numeroTerritorio}</b>`);

            // 2. 💎 NÚMERO ELEGANTE Y PERMANENTE EN EL CENTRO DE CADA POLÍGONO
            layer.bindTooltip(String(numeroTerritorio), {
              permanent: true,        // Se queda fijo en el mapa
              direction: 'center',    // Centrado geométrico
              className: 'texto-territorio-elegante' // Clase CSS personalizada
            });
          }
          // Efecto visual al pasar el mouse por encima
          layer.on('mouseover', function () { this.setStyle({ fillOpacity: 0.60 }); });
          layer.on('mouseout', function () { this.setStyle({ fillOpacity: 0.35 }); });
        }
      }).addTo(leafletMap);
    }

    // AGREGAR MARCADOR ÚNICO (Solo si te pasaron una dirección real, no al abrir de cero)
    if (lat && lng && address) {
      leafletMarker = L.marker([lat, lng]).addTo(leafletMap)
        .bindPopup(`<b>${address}</b>`)
        .openPopup(); // Este sí se abre porque es un edificio seleccionado real
    }
    // --- DETECTOR DINÁMICO DE ZOOM PARA LOS NÚMEROS DE TERRITORIO ---
    leafletMap.on('zoomend', function() {
      const zoomActual = leafletMap.getZoom();
      // Buscamos todos los cartelitos de territorio en la pantalla
      const elementosEtiqueta = document.querySelectorAll('.texto-territorio-elegante');
      
      elementosEtiqueta.forEach(elemento => {
        if (zoomActual >= 15) {
          // Si está cerca, le ponemos la ropa elegante de gala
          elemento.classList.add('vista-cerca');
        } else {
          // Si se aleja, le quitamos el fondo y lo achicamos
          elemento.classList.remove('vista-cerca');
        }
      });
    });
  }, 50);
}
// 📐 EDITOR DINÁMICO COMPLETO CON CAPTURA VISUAL DE COORDENADAS
function abrirEditorEdificio(building = null) {
  abrirVista("editarView");
    // --- CORRECCIÓN DEFINITIVA DE CANCELAR ---
  // Si el rol es predi, el destino SIEMPRE debe ser volver al buscador móvil
  const funcionCancelar = (currentRole === "predi") ? "cancelarEdificioMovil()" : "abrirVista('dashboardView')";
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
      <button class="secondary" style="margin-top: 10px;" onclick="${funcionCancelar}">❌ Cancelar</button>
    </div>
  `;
  document.getElementById("editarView").innerHTML = `
    <button class="secondary backModern" onclick="${funcionCancelar}">← Volver</button>
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
   // --- DETECTOR DINÁMICO DE ZOOM PARA LOS NÚMEROS DE TERRITORIO (Quita el enjambre) ---
    leafletMap.on('zoomend', function() {
      const zoomActual = leafletMap.getZoom();
      const etiquetas = document.querySelectorAll('.texto-territorio-elegante');
      
      etiquetas.forEach(etiqueta => {
        // En zoom 13 o menos (como en tu foto que se ve todo Encarnación y Posadas), se ocultan.
        // En zoom 14 o más (cuando ya te acercás a las avenidas), aparecen impecables.
        if (zoomActual <= 13) {
          etiqueta.classList.add('zoom-alejado');
        } else {
          etiqueta.classList.remove('zoom-alejado');
        }
      });
    }); 
    });
  }, 200);
}
// Función auxiliar para cuando el usuario móvil cancela la creación
function cancelarEdificioMovil() {
  // Ocultamos la vista del editor y apagamos el contenedor del dashboard
  document.getElementById("editarView").classList.remove("active");
  document.getElementById("mainDashboard").style.display = "none";
    // Volvemos a hacer visible el contenedor original de la app móvil
  document.getElementById("appContainer").style.display = "block";
    // Limpiamos los textos para dejar la app lista para otra búsqueda
  limpiarVista();
  mensajeInicial.style.display = "block";
}

