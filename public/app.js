// 🌐 CONFIGURACIÓN DEL SERVIDOR CENTRAL (BACKEND)
const API_BASE_URL = "https://visitas-app-inxa.onrender.com"; 

// =========================================================================
// 🚀 PARTE 1: CONFIGURACIÓN ESTRUCTURAL, ESTADOS GLOBALES Y ENRUTADOR DE VISTAS
// =========================================================================

// --- 🌐 DECLARACIÓN DE VARIABLES GLOBALES Y INSTANCIAS DE MAPAS ---
let leafletMap = null;
let leafletMarker = null;
let map = null;
let prediMiniMap = null;
let markerClusterGroup = null;
let currentRole = "";
let paginaActual = 1;


// --- 📦 ESTRATOS DE PERSISTENCIA Y FLUJO EN MEMORIA LOCAL ---
window.todosLosEdificiosDB = [];     // Pool central de sincronización de la base de datos
window.edificiosEncontrados = [];    // Resultados del motor predictivo móvil (predi)
window.indiceEdificioActual = 0;     // Carrusel: Índice activo en el buscador de campo
window.currentBuildingId = null;     // Transaccional: ID del edificio en foco operativo
window.miniMapaAdminInstance = null; // Instancia del mapa lateral del administrador
window.marcadoresClusterGlobal = null; // Grupo de empaquetado de marcadores (Clustering)
window.miTemporizadorMapa = null;    // Controlador para delays de re-render (InvalidateSize)
// Variables globales de tracking en memoria caliente
window.edificioActivo = null;
window.departamentoEnFoco = null; // Guardará el objeto completo del depto ({ _id, number })

// Variables de estado del módulo SuperAdmin
window.superAdminAutenticado = false;
window.superAdminPaginaActual = 1;
window.superAdminFiltrados = [];
const ELEMENTOS_POR_PAGINA = 10;

// --- 🎛️ SELECTORES NATIVOS DEL DOM (VISTA PREDICATIVA / MÓVIL) ---
const resultado = document.getElementById("resultado");
const infoEdificio = document.getElementById("infoEdificio");
const nota = document.getElementById("nota");
const btnOk = document.getElementById("btnOk");
const btnNo = document.getElementById("btnNo");
const btnSiguiente = document.getElementById("btnSiguiente");
const btnNuevoEdificio = document.getElementById("btnNuevoEdificio");
const reportBtn = document.getElementById("reportBtn");
const loadingBar = document.getElementById("loadingBar");

// =========================================================================
// 🔌 SECTOR: MOTOR DE COMUNICACIÓN CENTRALIZADO (API FETCH INTEGRADO)
// =========================================================================

/** * Envoltura segura sobre Fetch API para resolver URL base, inyección de encabezados,
 * control visual de carga y manejo automatizado de credenciales (username y role). */

async function apiFetch(endpoint, options = {}) {
  // 🔐 Recuperamos credenciales reales asegurando compatibilidad global
  const username = localStorage.getItem('username') || localStorage.getItem('user');
  const role = localStorage.getItem('role');
  
  // Mantenemos vivas las variables de control global que exige tu backend original
  if (username) currentUser = username;
  if (role) currentRole = role;
  
  // URL base adaptada para entornos de desarrollo local y tu despliegue en Render
  const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://visitas-app-inxa.onrender.com';

  // Si el endpoint ya viene con http o https, lo usamos directo; si no, le pegamos la baseUrl
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  // Configuración por defecto de cabeceras seguras alineadas con tu backend
  options.headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  // Inyección estricta en los headers para pasar el requireLogin del servidor
  if (username && role) {
    options.headers['x-user'] = username;
    options.headers['x-role'] = role;
  }

  // Desplegamos la barra estética de carga en la parte superior de la UI si existe
  if (typeof loadingBar !== 'undefined' && loadingBar) loadingBar.style.width = "30%";

  try {
    const response = await fetch(url, options);
    
    if (typeof loadingBar !== 'undefined' && loadingBar) loadingBar.style.width = "100%";
    setTimeout(() => { 
      if (typeof loadingBar !== 'undefined' && loadingBar) loadingBar.style.width = "0%"; 
    }, 400);

    // Si detectamos que no está autorizado o el token expiró, limpiamos y mandamos al login real
    if (response.status === 401 || response.status === 403) {
      console.warn("🔐 Credenciales inválidas o sin permisos. Redireccionando...");
      logout();
      return response;
    }

    return response;
  } catch (error) {
    if (typeof loadingBar !== 'undefined' && loadingBar) loadingBar.style.width = "0%";
    console.error("❌ Error físico de red en apiFetch:", error);
    throw error;
  }
}

/**
 * Genera de forma estandarizada los encabezados de autenticación 
 */
function obtenerHeadersSeguros() {
  return {
    "Content-Type": "application/json",
    "x-user": localStorage.getItem("username") || localStorage.getItem("user") || "",
    "x-role": localStorage.getItem("role") || ""
  };
}

/** * Controla la visibilidad de la barra o indicador de carga (spinner) */

function mostrarLoading(mostrar) {
  const spinner = document.getElementById("loading") || document.getElementById("loadingSpinner");
  if (spinner) {
    spinner.style.display = mostrar ? "flex" : "none";
  } else {
    document.body.style.cursor = mostrar ? "wait" : "default";
  }
}

// =========================================================================
// 🔐 SECTOR: CONTROL DE ACCESO, INICIO DE SESIÓN Y ORQUESTADOR DE VISTAS
// =========================================================================

/**
 * Procesa el inicio de sesión autenticando contra el backend corporativo
 */
async function login() {
  const userField = document.getElementById("loginUser") || (typeof loginUser !== 'undefined' ? loginUser : null);
  const passField = document.getElementById("loginPass") || (typeof loginPass !== 'undefined' ? loginPass : null);
  const msgLabel = document.getElementById("loginMsg");

  const user = userField?.value.trim();
  const pass = passField?.value.trim();

  if (!user || !pass) {
    alert("⚠️ Por favor complete todos los campos obligatorios.");
    if (msgLabel) msgLabel.innerText = "Campos incompletos.";
    return;
  }

  mostrarLoading(true);
  if (msgLabel) msgLabel.innerText = "";

  const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://visitas-app-inxa.onrender.com';

  try {
    const respuesta = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass })
    });

    if (!respuesta.ok) {
      const errData = await respuesta.json().catch(() => ({}));
      throw new Error(errData.message || "Credenciales incorrectas");
    }

    const datos = await respuesta.json();
    
    if (datos.ok === false || !datos.ok) {
      throw new Error("Usuario o contraseña incorrectos");
    }

    // Almacenamiento seguro usando AMBAS llaves para blindar compatibilidad (Etapa vieja y nueva)
    localStorage.setItem("username", datos.username);
    localStorage.setItem("user", datos.username);
    localStorage.setItem("role", datos.role);
    
    // Forzamos inyección en las globales críticas de ejecución
    currentUser = datos.username;
    currentRole = datos.role;

    console.log(`🔑 Sesión iniciada con éxito. Usuario: ${currentUser}, Rol: ${currentRole}`);
    
    // Ejecuta el ruteo inteligente y la carga condicional blindada
    await iniciarAppConPermisos();

  } catch (error) {
    console.error("Fallo de autenticación:", error);
    if (msgLabel) {
      msgLabel.innerText = error.message === "Failed to fetch" 
        ? "❌ Sin conexión con el servidor." 
        : `❌ ${error.message}`;
    } else {
      alert(`❌ Error: ${error.message}`);
    }
  } finally {
    mostrarLoading(false);
  }
}

/** * Gestiona el arranque de la app y decide qué descargar según el rol (Solución definitiva al 403) */

async function iniciarAppConPermisos() {
  const elLogin = document.getElementById("loginScreen");
  if (elLogin) elLogin.style.display = "none";
  
  if (typeof aplicarPermisos === "function") aplicarPermisos();

  const appContainer = document.getElementById("appContainer");
  const mainDashboard = document.getElementById("mainDashboard");

  if (currentRole === "predi") {
    // 📱 INTERFAZ MÓVIL FORZADA: Apagamos el dashboard administrativo por completo
    if (mainDashboard) mainDashboard.style.display = "none";
    if (appContainer) appContainer.style.display = "flex";
    
    // Desactivamos sub-vistas internas residuales
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    
    // 🛡️ REGLA DE ORO: Si es predi, TRABAJA BAJO DEMANDA. Cero descargas masivas para evitar el 403.
    window.baseDatosEdificiosMemoria = [];
    console.log("⚡ Entorno Predi configurado. Buscador directo en tiempo real activo.");
    
    if (typeof limpiarVista === "function") limpiarVista();
  } else {
    // 💻 PANEL DE CONTROL GENERAL (Admin / Conductor)
    if (mainDashboard) mainDashboard.style.display = "block";
    if (appContainer) appContainer.style.display = "none";
    
    // El administrador sí tiene permiso legal para precargar la base completa en memoria
    await descargarBaseAdministrativa();
    
    abrirVista("dashboardView");
  }
}

/** * Descarga masiva exclusiva para roles administrativos */

async function descargarBaseAdministrativa() {
  try {
    console.log("⏳ Sincronizando datos administrativos con el servidor...");
    const respuesta = await apiFetch('/admin/buildings?all=true', { method: "GET" });
    if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);

    const resultado = await respuesta.json();
    window.baseDatosEdificiosMemoria = resultado.data || [];
    window.todosLosEdificiosDB = window.baseDatosEdificiosMemoria;
    console.log(`✅ Sincronización exitosa. ${window.baseDatosEdificiosMemoria.length} edificios cargados en panel admin.`);
  } catch (error) {
    console.warn("⚠️ Error en precarga masiva:", error.message);
    window.baseDatosEdificiosMemoria = []; 
  }
}

/** * Orquestador dinámico de navegación: Apaga todas las pantallas y enciende la solicitada */

function abrirVista(vistaId) {
  // 🚨 REGLA DE PRIVACIDAD: Si es predi y quiere husmear vistas de admin, lo devolvemos al módulo móvil
  if (currentRole === "predi" && vistaId !== "editarView" && vistaId !== "appContainer") {
    if (document.getElementById("mainDashboard")) document.getElementById("mainDashboard").style.display = "none";
    if (document.getElementById("appContainer")) document.getElementById("appContainer").style.display = "flex";
    return;
  }

  const vistas = ["loginScreen", "loginView", "dashboardView", "appContainer", "editarView", "superAdminView"];
  
  vistas.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === vistaId) {
        if (id === "appContainer" || id === "dashboardView") {
          el.style.display = "flex";
        } else {
          el.style.display = "block";
        }
        el.classList.add("active");
      } else {
        el.style.display = "none";
        el.classList.remove("active");
      }
    }
  });

  // Manejo de pantallas especiales para predi editando un edificio sugerido
  if (vistaId === "editarView" && currentRole === "predi") {
    if (document.getElementById("appContainer")) document.getElementById("appContainer").style.display = "none";
    if (document.getElementById("mainDashboard")) document.getElementById("mainDashboard").style.display = "block";
  }

  if (vistaId === "dashboardView" && typeof mapaGeneral !== 'undefined' && mapaGeneral) {
    setTimeout(() => { mapaGeneral.invalidateSize(); }, 200);
  }
}

/** * Cierra sesión borrando el caché local y devuelve al usuario al loginScreen */

function logout() {
  localStorage.clear();
  currentUser = "";
  currentRole = "";
  window.todosLosEdificiosDB = [];
  window.baseDatosEdificiosMemoria = [];
  window.edificiosEncontrados = [];
  abrirVista("loginScreen");
}

/** * Oidor de carga inicial: Recupera la sesión guardada de forma automática al abrir la web */

window.addEventListener("load", async () => {
  const savedUser = localStorage.getItem("username") || localStorage.getItem("user");
  const savedRole = localStorage.getItem("role");
  
  if (savedUser && savedRole) {
    currentUser = savedUser;
    currentRole = savedRole;
    console.log(`🔄 Restaurando sesión activa en segundo plano para: ${currentUser}`);
    await iniciarAppConPermisos();
  } else {
    abrirVista("loginScreen");
  }
  
  // Soporte nativo para enlaces QR móviles (?building=ID)
  const params = new URLSearchParams(window.location.search);
  const buildingIdParam = params.get("building");
  if (buildingIdParam && typeof cargarDepto === "function") {
    currentBuildingId = buildingIdParam;
    if (document.getElementById("mensajeInicial")) {
      document.getElementById("mensajeInicial").style.display = "none";
    }
    await cargarDepto();
  }
});

// =========================================================================
// 📱 SECTOR: MOTOR DE BÚSQUEDA, FLUIDO DE VISITA Y CONTROL ANTI-ERROR (PREDI)
// =========================================================================

/** * 1. MOTOR DE BÚSQUEDA * Busca un edificio por dirección o código en el backend. */

async function buscar() {
  if (typeof limpiarVista === "function") {
    limpiarVista();
  } else {
    const res = document.getElementById("resultado");
    if (res) res.innerHTML = "";
  }

  const inputCampo = document.getElementById("buildingId") || (typeof buildingId !== 'undefined' ? buildingId : null);
  if (!inputCampo) {
    console.error("❌ Error: No se encontró el elemento input 'buildingId'.");
    return;
  }

  const input = typeof normalizarDireccion === "function" ? normalizarDireccion(inputCampo.value) : inputCampo.value.trim();
  if (!input) return;

  console.log(`🔍 Buscando edificio en backend: '${input}'`);
  if (document.getElementById("mensajeInicial")) {
    document.getElementById("mensajeInicial").style.display = "none";
  }

  const resLabel = document.getElementById("resultado");
  if (resLabel) resLabel.innerText = "Buscando en servidor...";

  try {
    // Buscamos el edificio por su dirección
    const b = await apiFetch(`/building/${encodeURIComponent(input)}`);
    if (!b.ok) {
      if (b.status === 404) {
        tratarEdificioNoEncontrado();
        return;
      }
      throw new Error(`Error en servidor: ${b.status}`);
    }
    
    const building = await b.json();

    // Control de respuesta vacía o error devuelto en JSON
    if (building.error === "NOT_FOUND" || !building || !building._id) {
      tratarEdificioNoEncontrado();
      return;
    }

    // 🛡️ Control de Bloqueo Administrativo integrado
    if (building.error === "EDIFICIO_BLOQUEADO" || building.isBlocked) {
      alert("🚫 ACCESO DENEGADO:\nEste edificio está bloqueado por el Administrador y no puede ser visitado en este momento.");
      if (resLabel) resLabel.innerText = ""; 
      if (document.getElementById("departamentoVisitar")) {
        document.getElementById("departamentoVisitar").innerText = "--";
      }
      return; 
    }

    // Seteo único de variables globales del edificio seleccionado
    window.currentBuildingId = building._id;
    window.edificioActivo = building;

    console.log(`✅ Edificio detectado: ${building.address}. Solicitando primer depto...`);
    
    // Solicitamos el primer departamento disponible sin mostrar alerta inicial
    await sortearSiguienteDepartamento(false);

  } catch (error) {
    console.error("❌ Detalle del error en buscar:", error);
    tratarEdificioNoEncontrado();
  }
}

/** * 2. ALGORITMO DE EXCLUSIÓN Y SORTEO * Consulta la ruta /next del backend para obtener un departamento aleatorio no visitado recientemente. */

async function sortearSiguienteDepartamento(mostrarAlerta = true) {
  const buildingId = window.currentBuildingId;
  if (!buildingId) {
    console.warn("⚠️ No se puede sortear un departamento porque no hay buildingId activo.");
    return;
  }

  try {
    console.log(`🎲 Solicitando depto aleatorio al backend para edificio: ${buildingId}...`);
    const res = await apiFetch(`/next/${buildingId}`);
    if (!res) throw new Error("No se obtuvo respuesta del servidor.");

    const data = res.json ? await res.json() : res;

    // Si no hay departamentos disponibles en este bloque
    if (data.message === "NO_AVAILABLE" || data.message === "COMPLETED") {
      alert("🔄 Todos los departamentos de este edificio fueron visitados en los últimos 4 meses o no hay unidades configuradas.");
      window.departamentoEnFoco = null;
      const resultadoH2 = document.getElementById("resultado");
      if (resultadoH2) resultadoH2.innerText = "Fin";
      return;
    }

    // Si saltó un bloqueo administrativo en el endpoint /next
    if (data.message === "EDIFICIO_BLOQUEADO") {
      alert("🚫 Este edificio está bloqueado de forma administrativa.");
      tratarEdificioNoEncontrado();
      return;
    }

    // 🎯 ÉXITO: Seteamos el departamento en foco
    if (data && data.dept) {
      window.departamentoEnFoco = data.dept;
      console.log(`🎯 Sorteo exitoso. Próximo depto: ${data.dept.number}`);
      
      // Renderizamos el flujo adaptado y ocultamos el botón Siguiente
      mostrarEstructuraFlujoVisita();

      if (mostrarAlerta && typeof notify === "function") {
        notify("Nuevo departamento asignado");
      }
    }
  } catch (err) {
    console.error("❌ Error en sorteo de departamento:", err);
    alert("⚠️ No se pudo obtener el siguiente departamento del servidor.");
  }
}

/** * 3. CONTROLADOR INTERFAZ FLUJO MÓVIL * Sincroniza la visibilidad y limpia los paneles de index.html para iniciar la votación. */

async function mostrarEstructuraFlujoVisita() {
  const d = window.departamentoEnFoco;

  // Renderizar el número de departamento en h2#resultado
  const resultadoH2 = document.getElementById("resultado");
  if (resultadoH2) {
    resultadoH2.innerText = d && d.number ? d.number : "--";
  }

  // 🛑 BLINDAJE ANTI-ERROR: Ocultamos por completo el botón "Siguiente depto". Solo aparecerá al marcar.
  const btnSiguiente = document.getElementById("btnSiguiente");
  if (btnSiguiente) {
    btnSiguiente.style.visibility = "hidden";
    btnSiguiente.style.display = "none";
    btnSiguiente.setAttribute("onclick", "ejecutarAvanzarDepartamento()");
  }

  // Ajustes de visibilidad de controles nativos
  if (document.getElementById("mensajeInicial")) document.getElementById("mensajeInicial").style.display = "none";
  if (document.getElementById("nota")) document.getElementById("nota").style.display = "block";
  if (document.getElementById("btnOk")) document.getElementById("btnOk").style.display = "block";
  if (document.getElementById("btnNo")) document.getElementById("btnNo").style.display = "block";
  if (document.getElementById("btnNuevoEdificio")) document.getElementById("btnNuevoEdificio").style.display = "none";

  // Lanzamos la carga de la ficha técnica estática e info abajo
  console.log("🔄 Cargando info estática del edificio...");
  await mostrarInfoEdificio();
}

/** * 4. FICHADO TÉCNICO Y MAPA ESTÁTICO * Rellena la tarjeta informativa inferior y el mini mapa Leaflet desde el backend. */

async function mostrarInfoEdificio() {
  const currentBuildingId = window.currentBuildingId;
  if (!currentBuildingId) {
    console.warn("⚠️ No se puede cargar info del edificio porque currentBuildingId está vacío.");
    return;
  }

  try {
    const res = await apiFetch(`/building-info/${currentBuildingId}`);
    if (!res) throw new Error("No se recibió respuesta para info-building.");
    
    const data = res.json ? await res.json() : res;
    const b = data.building;
    if (!b) return;

    // ✨ Cálculo de Edificio Nuevo (Lapso de 30 días)
    let cartelNuevoHtml = "";
    if (b.createdAt || b.fechaCreacion) { 
      const fechaCreacion = new Date(b.createdAt || b.fechaCreacion);
      const hoy = new Date();
      const diferenciaDias = Math.floor((hoy - fechaCreacion) / (1000 * 60 * 60 * 24));
      if (diferenciaDias <= 30) {
        const fechaFormateada = fechaCreacion.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        cartelNuevoHtml = `Edificio creado el ${fechaFormateada}`;
      }
    }

    if (typeof reportBtn !== 'undefined' && reportBtn) {
      reportBtn.style.display = "none"; 
    }

    const infoEdificio = document.getElementById("infoEdificio");
    if (!infoEdificio) return;
    infoEdificio.style.display = "block";

    const fechaUltimaVisita = data.lastVisit ? new Date(data.lastVisit.date).toLocaleDateString('es-AR') : "Nunca";

    infoEdificio.innerHTML = `
      <div class="sectionCard" style="background: #121214; border: 1px solid #27272a; padding: 16px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom: 14px;">
          <div>
            <div style="font-size:24px; font-weight:800; color:#ffffff; line-height:1.2; letter-spacing: -0.5px;">${b.address}</div>
            <div style="color:#d4d4d8; font-size:14px; margin-top:4px; font-weight: 500;">${b.address2 || "Sin datos adicionales"}</div>
          </div>
          <div style="background:#27272a; padding:6px 10px; border-radius:8px; font-size:13px; font-weight:700; white-space:nowrap; color:#ffffff; border: 1px solid #3f3f46;">🏢 ${b.name || "Edificio"}</div>
        </div>
        <div style="display: flex; gap: 14px; align-items: center; justify-content: space-between;">
          <div style="flex: 1; display: flex; flex-direction: column; gap: 8px; font-size: 14px; color:#ffffff;">
            <div>🗺️ <b>Territorio:</b> <span style="background: #27272a; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${b.territory || "-"}</span></div>
            <div>🔢 <b>Pisos:</b> <span style="font-weight: 600; color: #3b82f6;">${b.floors || 0}</span></div>
            <div style="color:#e4e4e7; font-size: 13px; line-height: 1.3;">📋 <b>Notas:</b> <span style="font-style: italic; color: #d4d4d8;">${b.description || "Sin anotaciones."}</span></div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; align-items: center; flex-shrink: 0;">
            <div id="miniMapaPredi" style="width: 115px; height: 95px; border-radius: 10px; border: 1px solid #4b5563; background:#1f1f22; pointer-events: none;"></div>
            <div style="background: #27272a; border: 1px solid #3f3f46; border-radius: 6px; padding: 4px 6px; display: flex; align-items: center; gap: 4px; font-size: 11px; color: #e4e4e7; width: 115px; justify-content: center; box-sizing: border-box;">
              <span>🗓️</span> <span>${fechaUltimaVisita}</span>
            </div>
          </div>
        </div>
        <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
          <div style="flex: 1; font-size: 12px; color:#a1a1aa; font-weight: 500; text-align: left;">
            ${cartelNuevoHtml ? `🏢 ${cartelNuevoHtml}` : ""}
          </div>
          <div style="flex: 1; display: flex; justify-content: flex-end;">
            <button onclick="abrirReporte()" style="background:#451a1a; color:#f87171; border:1px solid #ef4444; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px; white-space: nowrap; width: auto; margin: 0;">
              ⚠️ Informar problema
            </button>
          </div>
        </div>
        ${data.issue ? `
          <div style="background:#7f1d1d; color:#fef2f2; border:1px solid #dc2626; padding:10px; border-radius:10px; margin-top:12px; font-size:13px; font-weight:600; line-height:1.4;">
            ⚠ <b>Alerta (${data.issue.type}):</b> ${data.issue.description || "Sin detalles"}
          </div>
        ` : ""}
      </div>
    `;

    // Renderización limpia del Mapa
    const miniMapaDiv = document.getElementById("miniMapaPredi");
    if (miniMapaDiv) {
      if (prediMiniMap) {
        try { prediMiniMap.remove(); } catch(e){}
        prediMiniMap = null;
      }
      prediMiniMap = L.map('miniMapaPredi', {
        zoomControl: false, dragging: false, touchZoom: false,
        scrollWheelZoom: false, doubleClickZoom: false
      });
     // 🗺️ CAPA LEAFLET ESTÁNDAR: Máxima claridad con nombres de calles 100% legibles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
  maxZoom: 19 
}).addTo(prediMiniMap);
      let centradoExitoso = false;
      if (b.latitude && b.longitude) {
        const lat = parseFloat(b.latitude);
        const lng = parseFloat(b.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          L.marker([lat, lng]).addTo(prediMiniMap);
          prediMiniMap.setView([lat, lng], 16);
          centradoExitoso = true;
        }
      }
      if (!centradoExitoso && b.territory && typeof misTerritoriosGeoJSON !== 'undefined' && misTerritoriosGeoJSON) {
        let capaGeoJSON = L.geoJSON(misTerritoriosGeoJSON, {
          filter: (f) => String(f.properties.name || f.properties.Territorio_N) === String(b.territory),
          style: { color: '#2563eb', weight: 2, fillColor: '#2563eb', fillOpacity: 0.15 }
        }).addTo(prediMiniMap);
        if (capaGeoJSON.getLayers().length > 0) {
          prediMiniMap.fitBounds(capaGeoJSON.getBounds(), { padding: [5, 5] });
          centradoExitoso = true;
        }
      }
      if (!centradoExitoso) {
        prediMiniMap.setView([-27.36708, -55.89608], 15);
      }
      setTimeout(() => { if (prediMiniMap) prediMiniMap.invalidateSize(); }, 220);
    }
  } catch (error) {
    console.error("❌ Error en mostrarInfoEdificio:", error);
  }
}

// =========================================================================
// 🔀 CONTROL DE VISITAS EN MEMORIA VOLÁTIL Y TRANSMISIÓN AL AVANZAR (ACUMULADO)
// =========================================================================

// Variable global interna para retener el estado elegido en pantalla antes de confirmar el avance
window.votoTemporal = null;

/**
 * 5. SELECCIÓN DE ESTADO EN PANTALLA (FASE DE PREPARACIÓN)
 * Captura el clic de los botones, pinta visualmente la interfaz y habilita el avance.
 */
function marcar(estado) {
  // 🔒 Validación estricta de nivel 2: Filtramos valores espurios antes de retener
  if (estado !== "ATENDIO" && estado !== "NO_EN_CASA") {
    console.error(`❌ Error crítico: Se intentó seleccionar un estado inválido: "${estado}"`);
    return;
  }

  if (!window.departamentoEnFoco || !window.departamentoEnFoco._id) {
    alert("⚠️ No hay un departamento en foco para asignarle este estado.");
    return;
  }

  // Retenemos la elección de forma interna en memoria (No viaja al servidor todavía)
  window.votoTemporal = estado;
  console.log(`📌 Estado seleccionado temporalmente en memoria: "${window.votoTemporal}" para depto ${window.departamentoEnFoco.number}`);

  // 🔓 REVELACIÓN DE CONTROL: Mostramos el botón para avanzar y confirmar el envío
  const btnSiguiente = document.getElementById("btnSiguiente");
  if (btnSiguiente) {
    console.log("🔓 Habilitando botón 'Siguiente depto' para autorizar el envío definitivo.");
    btnSiguiente.style.visibility = "visible";
    btnSiguiente.style.display = "inline-block";
  }
}

/**
 * 6. ACCIÓN DE CONFIRMACIÓN Y TRANSMISIÓN AL backend
 * Se dispara al presionar "Siguiente depto". Empaqueta la nota actual, transmite a la nube/offline y rota el depto.
 */
async function ejecutarAvanzarDepartamento() {
  console.log("🎯 El usuario presionó 'Siguiente depto'. Iniciando proceso de empaquetado y envío...");

  if (!window.currentBuildingId) {
    alert("⚠️ Error: No hay un edificio activo seleccionado.");
    return;
  }
  if (!window.departamentoEnFoco || !window.departamentoEnFoco._id) {
    alert("⚠️ Error: No hay un departamento activo en foco.");
    return;
  }

  // 🛑 CONTROL DE SEGURIDAD: Validamos que realmente haya seleccionado una opción antes de avanzar
  if (!window.votoTemporal) {
    alert("⚠️ Por favor, selecciona primero si atendió o no está en casa antes de avanzar.");
    return;
  }

  const deptoNumero = window.departamentoEnFoco.number;
  const notaInput = document.getElementById("nota") || document.getElementById("observacionRapida");
  const comentario = notaInput ? notaInput.value.trim() : "";

  // Construimos el Payload definitivo combinando el botón presionado y la nota final de la caja de texto
  const cuerpoPayload = {
    departmentId: window.departamentoEnFoco._id,
    buildingId: window.currentBuildingId,
    status: window.votoTemporal, 
    note: comentario ? comentario : `Visita realizada al depto ${deptoNumero}`
  };

  // --- FASE DE TRANSMISIÓN (Estrategia Red Primero + Mochila de Auxilio) ---
  try {
    console.log(`🚀 Transmitiendo definitivo al servidor -> Depto: ${deptoNumero}, Estado: ${window.votoTemporal}`);
    const res = await apiFetch("/visit", {
      method: "POST",
      body: JSON.stringify(cuerpoPayload)
    });

    if (!res || (!res.ok && res.error)) {
      throw new Error("Falla de respuesta controlada en el endpoint.");
    }

    console.log(`✅ Registro guardado con éxito en la nube para el depto ${deptoNumero}.`);

  } catch (err) {
    // 💾 CAPA DE RESCATE OFFLINE: Si no hay datos en la calle, directo a la mochila local sin trabar al predi
    console.warn(`📡 [MODO OFFLINE] Sin señal en la calle para enviar depto ${deptoNumero}. Guardando en memoria local...`);
    guardarEnMochilaLocal("visitas_pendientes", cuerpoPayload);
  }

  // --- FASE DE RESETEO Y ROTACIÓN DE INTERFAZ ---
  // 🧼 Limpiamos la caja de notas y el voto temporal para el depto que viene
  if (notaInput) {
    notaInput.value = "";
    console.log("🧼 Caja de comentarios vaciada para la próxima unidad.");
  }
  window.votoTemporal = null; 

  // Traemos de forma automática el siguiente departamento sorteado
  await sortearSiguienteDepartamento(false);
}

/**
 * 💾 SOPORTE LOCALSTORAGE
 * Función genérica para retener elementos en el almacenamiento local del teléfono.
 */
function guardarEnMochilaLocal(clave, datos) {
  let listado = JSON.parse(localStorage.getItem(clave)) || [];
  datos.guardadoEnLocalEl = new Date().toISOString(); 
  listado.push(datos);
  localStorage.setItem(clave, JSON.stringify(listado));
  console.log(`📦 Elemento retenido con éxito en la clave "${clave}". Total acumulado offline: ${listado.length}`);
}

/**
 * 📡 EL VIGILANTE DE INTERNET
 * Sincroniza en segundo plano los datos acumulados apenas el dispositivo recupera señal móvil estable.
 */
window.addEventListener('online', async () => {
  const visitasPendientes = JSON.parse(localStorage.getItem("visitas_pendientes")) || [];
  const reportesPendientes = JSON.parse(localStorage.getItem("reportes_pendientes")) || [];

  if (visitasPendientes.length === 0 && reportesPendientes.length === 0) return;

  console.log(`📡 Conexión recuperada. Sincronizando: ${visitasPendientes.length} visitas y ${reportesPendientes.length} reportes...`);

  let erroresCarga = false;

  // 1. Despachamos las visitas retenidas
  if (visitasPendientes.length > 0) {
    const visitasNoEnviadas = [];
    for (let visita of visitasPendientes) {
      try {
        const res = await apiFetch("/visit", { method: "POST", body: JSON.stringify(visita) });
        if (!res || !res.ok) throw new Error();
      } catch (err) {
        visitasNoEnviadas.push(visita);
        erroresCarga = true;
      }
    }
    if (visitasNoEnviadas.length > 0) {
      localStorage.setItem("visitas_pendientes", JSON.stringify(visitasNoEnviadas));
    } else {
      localStorage.removeItem("visitas_pendientes");
    }
  }

  // 2. Despachamos los reportes retenidos (issues)
  if (reportesPendientes.length > 0) {
    const reportesNoEnviados = [];
    for (let reporte of reportesPendientes) {
      try {
        const res = await apiFetch("/issues", { method: "POST", body: JSON.stringify(reporte) });
        if (!res || !res.ok) throw new Error();
      } catch (err) {
        reportesNoEnviados.push(reporte);
        erroresCarga = true;
      }
    }
    if (reportesNoEnviados.length > 0) {
      localStorage.setItem("reportes_pendientes", JSON.stringify(reportesNoEnviados));
    } else {
      localStorage.removeItem("reportes_pendientes");
    }
  }

  // Alerta ligera al usuario
  if (!erroresCarga) {
    alert("🔄 ¡Datos sincronizados! Las visitas y reportes tomados sin internet ya se subieron al servidor con éxito.");
    if (typeof cargarEdificios === "function") cargarEdificios();
  } else {
    console.warn("⚠️ Sincronización parcial: Quedan elementos pendientes en zonas de baja cobertura.");
  }
});

/** * 7. INTERRUPTOR VISUAL DE EXCEPCIONES * Oculta paneles y despliega opciones de rescate en caso de direcciones inexistentes. */

function tratarEdificioNoEncontrado() {
  const resLabel = document.getElementById("resultado");
  const btnNuevo = document.getElementById("btnNuevoEdificio");
  const deptoLabel = document.getElementById("departamentoVisitar");
  const inputCampo = document.getElementById("buildingId");
  
  if (resLabel) {
    resLabel.innerHTML = `<div style="color:#ef4444; text-align:center; padding:10px; font-weight:bold;">Edificio no encontrado</div>`;
  }
  if (deptoLabel) deptoLabel.innerText = "--";
  
  // Desplegamos el botón de rescate en la interfaz
  if (btnNuevo) {
    btnNuevo.style.display = "block";
    
    btnNuevo.onclick = function() {
      console.log("➕ El usuario tocó el botón '+ Agregar edificio'. Enlazando con el Editor Expandido...");
      
      // Capturamos lo que escribió el usuario para precargárselo en el formulario nuevo
      const direccionIngresada = inputCampo ? inputCampo.value.trim() : "";
      
      if (typeof abrirEditorEdificio === "function") {
        console.log(`🚀 Abriendo formulario de creación con la dirección propuesta: "${direccionIngresada}"`);
        // Llamamos a tu función expandida pasándole la dirección sugerida
        abrirEditorEdificio({ address: direccionIngresada });
      } else {
        console.error("❌ Error crítico: No se encontró la función 'abrirEditorEdificio' en el archivo.");
        alert("⚠️ No se pudo abrir el editor porque la función 'abrirEditorEdificio' no está disponible.");
      }
    };
  }
  
  // Ocultamos de forma segura el formulario de la visita actual para evitar mezclas
  if (document.getElementById("nota")) document.getElementById("nota").style.display = "none";
  if (document.getElementById("btnOk")) document.getElementById("btnOk").style.display = "none";
  if (document.getElementById("btnNo")) document.getElementById("btnNo").style.display = "none";
  if (document.getElementById("infoEdificio")) document.getElementById("infoEdificio").style.display = "none";
}

// =========================================================================
// 🪟 CONTROLADORES DE MODALES: REPORTES DE PROBLEMAS / INCIDENCIAS
// =========================================================================
/** * Abre un prompt integrado para disparar una incidencia directo a tu app.post("/issues") */

async function abrirModalIncidencia() {
  if (!window.currentBuildingId) return;
  
  const detalle = prompt("⚠️ Escriba el reporte o problema detectado en el edificio:");
  if (!detalle || detalle.trim() === "") return;

  const deptoId = window.departamentoEnFoco ? window.departamentoEnFoco._id : null;

  try {
    // Apunta a tu ruta nativa app.post("/issues")
    const res = await apiFetch("/issues", {
      method: "POST",
      body: JSON.stringify({
        buildingId: window.currentBuildingId,
        departmentId: deptoId,
        type: "Infraestructura",
        description: detalle.trim(),
        reportedBy: "Predi Campo",
        status: "PENDIENTE"
      })
    });

    if (res.ok) {
      alert("✅ Reporte de incidencia enviado al Administrador con éxito.");
    } else {
      alert("❌ No se pudo registrar la incidencia.");
    }
  } catch (err) {
    console.error("Error al enviar issue:", err);
  }
}
/**
 * Despliega el modal flotante de incidencias críticas en pantalla
 */
function abrirModalProblema() {
  const modal = document.getElementById("modalProblema");
  if (modal) {
    modal.style.display = "flex";
    modal.classList.add("animate-fade-in");
  }
  const txt = document.getElementById("txtProblema");
  if (txt) {
    txt.value = "";
    txt.focus();
  }
}

/**
 * Cierra y limpia de forma segura el modal de incidencias
 */
function cerrarModalProblema() {
  const modal = document.getElementById("modalProblema");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("animate-fade-in");
  }
}

/**
 * Procesa y despacha el reporte de una incidencia crítica sobre el edificio en foco
 */
async function enviarProblema() {
  const txt = document.getElementById("txtProblema");
  const detalleProblema = txt ? txt.value.trim() : "";

  if (!detalleProblema) {
    alert("⚠️ Por favor, describa detalladamente la incidencia observada.");
    return;
  }

  if (!window.currentBuildingId) {
    alert("⚠️ Error operativo: Falta referencia ID del edificio.");
    return;
  }

  try {
    const res = await apiFetch(`/buildings/${window.currentBuildingId}/report`, {
      method: "POST",
      body: JSON.stringify({ problema: detalleProblema })
    });

    if (res.ok) {
      alert("⚠️ Incidencia reportada y escalada al panel del Administrador.");
      cerrarModalProblema();
      
      // Sincronización en caliente y re-renderizado sin perder la posición del carrusel
      await preCargarBaseDatosEnMemoria();
      const idx = window.todosLosEdificiosDB.findIndex(b => (b.id || b._id) === window.currentBuildingId);
      if (idx !== -1) {
        window.edificiosEncontrados[window.indiceEdificioActual] = window.todosLosEdificiosDB[idx];
      }
      mostrarEdificioActual();
    } else {
      alert("❌ El servidor rechazó el envío del reporte.");
    }
  } catch (err) {
    console.error("Error físico al enviar reporte de incidencia:", err);
    alert("⚠️ Error de red. Compruebe su conexión a internet.");
  }
}

/**
 * Resetea y apaga por completo las cajas del buscador predictivo móvil
 */
function limpiarVista() {
  if (resultado) resultado.innerHTML = "";
  if (infoEdificio) infoEdificio.style.display = "none";
  if (reportBtn) reportBtn.style.display = "none";
  if (btnNuevoEdificio) btnNuevoEdificio.style.display = "none";
  
  if (prediMiniMap) {
    prediMiniMap.off();
    prediMiniMap.remove();
    prediMiniMap = null;
  }
  window.currentBuildingId = null;
}
// =========================================================================
// 💼 PARTE 3: PANEL DE ADMINISTRACIÓN, PAGINACIÓN, MODALES Y SUPERADMIN
// =========================================================================

/**
 * Renderiza la tabla principal del Administrador con paginación integrada.
 * Consume los datos directamente de 'window.todosLosEdificiosDB'.
 */
async function cargarEdificios() {
  const tablaCuerpo = document.getElementById("tablaEdificiosCuerpo");
  if (!tablaCuerpo) return;

  tablaCuerpo.innerHTML = "";

  // Si no hay datos cargados, intentamos una sincronización rápida
  if (!window.todosLosEdificiosDB || window.todosLosEdificiosDB.length === 0) {
    await preCargarBaseDatosEnMemoria();
  }

  const datosAIterar = window.todosLosEdificiosDB;

  if (datosAIterar.length === 0) {
    tablaCuerpo.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#a1a1aa; padding:20px;">📭 No hay edificios registrados en el sistema.</td></tr>`;
    actualizarControlesPaginacion(0);
    return;
  }

  // Cálculo de índices para la segmentación por página
  const indiceInicio = (paginaActual - 1) * ELEMENTOS_POR_PAGINA;
  const indiceFin = indiceInicio + ELEMENTOS_POR_PAGINA;
  const paginaSegmentada = datosAIterar.slice(indiceInicio, indiceFin);

  paginaSegmentada.forEach(e => {
    const fila = document.createElement("tr");
    const idEdificio = e.id || e._id;
    
    // Formateo estético del estado
    const estado = (e.status || e.estado || "Pendiente").toUpperCase();
    let colorEstado = "#cbd5e1";
    if (estado === "OK" || estado === "EFECTUADA") colorEstado = "#4ade80";
    else if (estado === "NO" || estado === "RECHAZADA") colorEstado = "#f87171";
    else if (estado === "PROBLEMA" || estado === "INCIDENCIA") colorEstado = "#fbbf24";

    fila.innerHTML = `
      <td style="font-weight: 600; color: #ffffff;">${e.address || "Sin Dirección"}</td>
      <td style="color: #cbd5e1;">${e.name || "-"}</td>
      <td style="color: #a1a1aa;">${e.territory || e.territorio || "-"}</td>
      <td><span style="color: ${colorEstado}; font-weight: bold; font-size: 13px;">● ${estado}</span></td>
      <td style="text-align: center;">
        <button class="btn-action-view" onclick="verDetalleEdificioAdmin('${idEdificio}')" title="Ver Detalles">👁️</button>
        <button class="btn-action-edit" onclick="abrirEditorEdificio({id: '${idEdificio}'})" title="Editar">✏️</button>
      </td>
    `;
    tablaCuerpo.appendChild(fila);
  });

  actualizarControlesPaginacion(datosAIterar.length);
}

/**
 * Actualiza dinámicamente las etiquetas y estados de los botones de paginación del Admin
 */
function actualizarControlesPaginacion(totalElementos) {
  const totalPaginas = Math.ceil(totalElementos / ELEMENTOS_POR_PAGINA) || 1;
  
  const infoPagina = document.getElementById("infoPaginacion");
  if (infoPagina) infoPagina.innerText = `Página ${paginaActual} de ${totalPaginas}`;

  const btnAnt = document.getElementById("btnFiltroAnterior");
  const btnSig = document.getElementById("btnFiltroSiguiente");

  if (btnAnt) btnAnt.disabled = (paginaActual === 1);
  if (btnSig) btnSig.disabled = (paginaActual >= totalPaginas);
}

function cambiarPaginaAdmin(direccion) {
  const totalPaginas = Math.ceil(window.todosLosEdificiosDB.length / ELEMENTOS_POR_PAGINA) || 1;
  
  if (direccion === -1 && paginaActual > 1) {
    paginaActual--;
  } else if (direccion === 1 && paginaActual < totalPaginas) {
    paginaActual++;
  }
  cargarEdificios();
}

/**
 * Despliega el panel lateral/modal con el desglose técnico completo de un edificio
 * @param {string} id - ID único del edificio seleccionado
 */
async function verDetalleEdificioAdmin(id) {
  const edificio = window.todosLosEdificiosDB.find(b => (b.id || b._id) === id);
  if (!edificio) return;

  const panel = document.getElementById("panelDetalleAdmin");
  const contenido = document.getElementById("contenidoDetalleAdmin");
  
  if (!panel || !contenido) return;

  window.currentBuildingId = id; // Fijamos contexto de operación

  contenido.innerHTML = `
    <h3 style="margin-top:0; color:#ffffff; font-size:20px; border-bottom:1px solid #3f3f46; padding-bottom:8px;">${edificio.address || 'Sin Dirección'}</h3>
    <table class="table-detalle-tecnico" style="width:100%; border-collapse:collapse; margin-top:10px; font-size:13px; color:#e4e4e7;">
      <tr><td style="padding:6px 0; color:#a1a1aa;">🏢 Nombre:</td><td style="font-weight:600;">${edificio.name || '-'}</td></tr>
      <tr><td style="padding:6px 0; color:#a1a1aa;">📍 Dirección 2:</td><td>${edificio.address2 || edificio.direccion2 || '-'}</td></tr>
      <tr><td style="padding:6px 0; color:#a1a1aa;">🗺️ Territorio:</td><td><strong>${edificio.territory || edificio.territorio || '-'}</strong></td></tr>
      <tr><td style="padding:6px 0; color:#a1a1aa;">📊 Estado Actual:</td><td><span style="font-weight:bold;">${(edificio.status || edificio.estado || 'Pendiente').toUpperCase()}</span></td></tr>
      <tr><td style="padding:6px 0; color:#a1a1aa;">📈 Total Visitas:</td><td>${edificio.visitas || 0}</td></tr>
      <tr><td style="padding:6px 0; color:#a1a1aa;">🌐 Latitud:</td><td style="font-family:monospace;">${edificio.latitude || edificio.lat || '-'}</td></tr>
      <tr><td style="padding:6px 0; color:#a1a1aa;">🌐 Longitud:</td><td style="font-family:monospace;">${edificio.longitude || edificio.lng || '-'}</td></tr>
      <tr><td style="padding:6px 0; color:#a1a1aa;">📝 Historial/Notas:</td><td style="font-style:italic; color:#cbd5e1;">"${edificio.notes || 'Sin anotaciones registradas'}"</td></tr>
    </table>
    
    <div id="adminMiniMapContainer" style="width:100%; height:180px; border-radius:8px; margin-top:15px; background:#27272a; position:relative;"></div>
  `;

  panel.style.display = "block";

  // --- Render del Mapa de Detalle para el Administrador ---
  setTimeout(() => {
    const lat = parseFloat(edificio.latitude || edificio.lat);
    const lng = parseFloat(edificio.longitude || edificio.lng);

    if (isNaN(lat) || isNaN(lng)) {
      const container = document.getElementById("adminMiniMapContainer");
      if (container) container.innerHTML = `<div style="color:#a1a1aa; text-align:center; padding-top:75px; font-size:12px;">📍 Registro sin coordenadas geográficas asociadas</div>`;
      return;
    }

    if (window.miniMapaAdminInstance) {
      window.miniMapaAdminInstance.off();
      window.miniMapaAdminInstance.remove();
      window.miniMapaAdminInstance = null;
    }

    try {
      window.miniMapaAdminInstance = L.map('adminMiniMapContainer', {
        zoomControl: true,
        attributionControl: false
      }).setView([lat, lng], 16);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(window.miniMapaAdminInstance);

      L.marker([lat, lng]).addTo(window.miniMapaAdminInstance)
        .bindPopup(edificio.address || "Edificio")
        .openPopup();

      setTimeout(() => { if (window.miniMapaAdminInstance) window.miniMapaAdminInstance.invalidateSize(); }, 150);
    } catch (err) {
      console.error("Error al instanciar mapa del administrador:", err);
    }
  }, 120);
}

function cerrarDetalleAdmin() {
  const panel = document.getElementById("panelDetalleAdmin");
  if (panel) panel.style.display = "none";
  
  if (window.miniMapaAdminInstance) {
    window.miniMapaAdminInstance.off();
    window.miniMapaAdminInstance.remove();
    window.miniMapaAdminInstance = null;
  }
}

// =========================================================================
// 🔑 CORE DE PRIVILEGIOS AVANZADOS: MÓDULO SUPERADMIN
// =========================================================================

/**
 * Valida la clave maestra de acceso y abre la consola avanzada del SuperAdmin
 */
function verificarAccesoSuperAdmin() {
  const claveInput = document.getElementById("superAdminKey")?.value.trim();

  if (claveInput === "2414") { // Llave maestra estructural de seguridad
    window.superAdminAutenticado = true;
    alert("🔓 Acceso de SuperAdmin Autorizado. Abriendo panel avanzado...");
    if (document.getElementById("superAdminKey")) document.getElementById("superAdminKey").value = "";
    abrirVista("superAdminView");
    window.superAdminPaginaActual = 1;
    ejecutarFiltroSuperAdmin();
  } else {
    alert("❌ Clave maestra incorrecta. Intento denegado.");
  }
}

/**
 * Procesa filtros cruzados de incidencias y renderiza la tabla analítica avanzada
 */
function ejecutarFiltroSuperAdmin() {
  if (!window.superAdminAutenticado) return;

  const selectorFiltro = document.getElementById("superAdminFiltroEstado")?.value || "TODOS";
  
  // El SuperAdmin trabaja priorizando edificios que reporten problemas o notas de campo
  window.superAdminFiltrados = window.todosLosEdificiosDB.filter(e => {
    const estado = (e.status || e.estado || "Pendiente").toUpperCase();
    
    if (selectorFiltro === "TODOS") return true;
    if (selectorFiltro === "PROBLEMA") return (estado === "PROBLEMA" || estado === "INCIDENCIA" || !!e.problema);
    return estado === selectorFiltro;
  });

  renderizarTablaSuperAdmin();
}

/**
 * Renderiza la grilla operativa del SuperAdmin con herramientas de borrado e historiales
 */
function renderizarTablaSuperAdmin() {
  const tabla = document.getElementById("tablaSuperAdminCuerpo");
  if (!tabla) return;

  tabla.innerHTML = "";

  if (window.superAdminFiltrados.length === 0) {
    tabla.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#a1a1aa; padding:20px;">📭 Ningún registro cumple el criterio del filtro seleccionado.</td></tr>`;
    actualizarPaginacionSuperAdmin(0);
    return;
  }

  const inicio = (window.superAdminPaginaActual - 1) * ELEMENTOS_POR_PAGINA;
  const fin = inicio + ELEMENTOS_POR_PAGINA;
  const segmento = window.superAdminFiltrados.slice(inicio, fin);

  segmento.forEach(e => {
    const id = e.id || e._id;
    const fila = document.createElement("tr");
    
    fila.innerHTML = `
      <td style="color:#ffffff; font-weight:500;">${e.address || 'Sin Dirección'}</td>
      <td style="color:#e4e4e7;">${e.territory || e.territorio || '-'}</td>
      <td style="color:#fcd34d; font-size:12px; max-width:200px; overflow:hidden; text-overflow:ellipsis;">${e.notes || e.problema || 'Sin incidencias activas'}</td>
      <td style="color:#cbd5e1; font-weight:bold; font-size:12px;">${(e.status || e.estado || 'Pendiente').toUpperCase()}</td>
      <td style="text-align:center;">
        <button class="btn-super-history" onclick="verHistorialLogs('${id}')" title="Ver Historial de Logs">📜</button>
        <button class="btn-super-delete" onclick="eliminarEdificioDestructivo('${id}')" title="Eliminar Registro permanentemente">🗑️</button>
      </td>
    `;
    tabla.appendChild(fila);
  });

  actualizarPaginacionSuperAdmin(window.superAdminFiltrados.length);
}

function actualizarPaginacionSuperAdmin(total) {
  const paginas = Math.ceil(total / ELEMENTOS_POR_PAGINA) || 1;
  const label = document.getElementById("infoPaginacionSuper");
  if (label) label.innerText = `Página ${window.superAdminPaginaActual} de ${paginas}`;

  const btnAnt = document.getElementById("btnSuperAnt");
  const btnSig = document.getElementById("btnSuperSig");

  if (btnAnt) btnAnt.disabled = (window.superAdminPaginaActual === 1);
  if (btnSig) btnSig.disabled = (window.superAdminPaginaActual >= paginas);
}

function cambiarPaginaSuper(dir) {
  const totalPaginas = Math.ceil(window.superAdminFiltrados.length / ELEMENTOS_POR_PAGINA) || 1;
  if (dir === -1 && window.superAdminPaginaActual > 1) window.superAdminPaginaActual--;
  if (dir === 1 && window.superAdminPaginaActual < totalPaginas) window.superAdminPaginaActual++;
  renderizarTablaSuperAdmin();
}

/**
 * Ejecuta la eliminación física definitiva de un registro en la Base de Datos
 * @param {string} id - ID del edificio a destruir
 */
async function eliminarEdificioDestructivo(id) {
  const confirmacion = confirm("⚠️ ADVERTENCIA CRÍTICA ⚠️\n\n¿Está absolutamente seguro de eliminar permanentemente este edificio? Esta acción borrará de forma irreversible el historial de visitas, coordenadas y reportes asociados.");
  if (!confirmacion) return;

  try {
    const res = await apiFetch(`/admin/buildings/${id}`, { method: "DELETE" });
    if (res.ok) {
      alert("🗑️ El registro ha sido eliminado físicamente de la base de datos.");
      await preCargarBaseDatosEnMemoria();
      ejecutarFiltroSuperAdmin();
      if (typeof cargarEdificios === "function") cargarEdificios(); // Sincroniza la vista general de Admin
    } else {
      alert("❌ Error: El servidor denegó la solicitud de borrado.");
    }
  } catch (err) {
    console.error("Error crítico en cascada de borrado:", err);
    alert("⚠️ Falló la comunicación destructiva con el backend.");
  }
}

/**
 * Consulta y despliega la traza de auditoría profunda de acciones de un registro
 */
async function verHistorialLogs(id) {
  try {
    const res = await apiFetch(`/admin/buildings/${id}/logs`);
    if (res.ok) {
      const logs = await res.json();
      const formatLogs = logs.length > 0 
        ? logs.map(l => `• [${l.fecha || 'Fecha ausente'}] - ${l.usuario || 'Sistema'}: ${l.accion || 'Modificación'}`).join("\n")
        : "• No se registran logs históricos previos para este elemento.";
      
      alert(`📜 TRACE DE AUDITORÍA (ID: ${id}):\n\n${formatLogs}`);
    } else {
      alert("❌ No se pudo recuperar el historial de auditoría.");
    }
  } catch (err) {
    console.error("Falla en petición de logs:", err);
    alert("⚠️ Error de red al solicitar los logs.");
  }
}

// Enlace de compatibilidad para el botón de SuperAdmin del HTML
function abrirAccesoSuperAdmin() {
  const clave = prompt("🔑 Ingrese la clave maestra de SuperAdmin:");
  if (clave) {
    const inputOculto = document.getElementById("superAdminKey") || { value: "" };
    inputOculto.value = clave; 
    // Si no tenés el input físico en el HTML, le pasamos el valor directo a la función de validación
    if (clave === "2414") {
      window.superAdminAutenticado = true;
      alert("🔓 Acceso de SuperAdmin Autorizado. Abriendo panel avanzado...");
      abrirVista("superAdminView");
      window.superAdminPaginaActual = 1;
      if (typeof ejecutarFiltroSuperAdmin === "function") ejecutarFiltroSuperAdmin();
    } else {
      alert("❌ Clave maestra incorrecta. Intento denegado.");
    }
  }
}
// =========================================================================
// 🗺️ PARTE 4: MOTOR CARTOGRÁFICO MAESTRO, CAPAS GEOJSON Y COMPLEMENTOS VIALES
// =========================================================================

let mapaGeneral = null;
let capaGeoJSONFija = null;

/**
 * Inicializa la arquitectura del mapa general interactivo del Administrador.
 * Monta las coordenadas de centrado enfocadas en Posadas.
 */
function inicializarMapaGeneralAdministrador() {
  const mapaDiv = document.getElementById("mapaGeneralAdmin");
  if (!mapaDiv || mapaGeneral) return; // Salvaguarda contra duplicación de instancia

  try {
    // Coordenadas base centradas en Posadas, Misiones, Argentina
    mapaGeneral = L.map('mapaGeneralAdmin', {
      zoomControl: true,
      attributionControl: false
    }).setView([-27.36708, -55.89608], 13);

    // Capa base de mapas en estética oscura (Dark Mode Pro)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd'
    }).addTo(mapaGeneral);

    // Carga complementaria de los polígonos de zonas y territorios
    cargarZonasGeoJSON();

    // Event listener único y optimizado para ajustar visibilidad de etiquetas según el zoom
    mapaGeneral.on('zoomend', function() {
      const zoomActual = mapaGeneral.getZoom();
      const etiquetas = document.querySelectorAll('.label-territorio-mapa');
      
      etiquetas.forEach(tag => {
        // Solo mostramos textos de zonas en zooms profundos para evitar saturar la GPU
        if (zoomActual >= 14) {
          tag.style.display = 'block';
        } else {
          tag.style.display = 'none';
        }
      });
    });

  } catch (err) {
    console.error("❌ Fallo crítico al levantar la arquitectura Leaflet principal:", err);
  }
}

/**
 * Descarga e inyecta la capa de polígonos vectoriales GeoJSON en el mapa maestro.
 * Aplica estilos en paleta de colores pasteles translúcidos sobre fondo oscuro.
 */
async function cargarZonasGeoJSON() {
  if (!mapaGeneral) return;

  try {
    // Si manejás el GeoJSON local en memoria o desde un endpoint específico
    const res = await apiFetch('/assets/territorios.geojson');
    if (!res.ok) {
      console.warn("⚠️ Archivo territorios.geojson no disponible en el servidor o ruta inválida.");
      return;
    }
    
    const datosGeoJSON = await res.json();

    capaGeoJSONFija = L.geoJSON(datosGeoJSON, {
      style: function(feature) {
        // Asignación de colores pasteles basada en el residuo numérico de la zona
        const idTerritorio = parseInt(feature.properties?.name || feature.properties?.Territorio_N || 0);
        const paletaPastel = ["#473f57", "#394a51", "#3d4a3e", "#54483b", "#513939", "#4b3947", "#393b51"];
        const colorAsignado = paletaPastel[idTerritorio % paletaPastel.length];

        return {
          fillColor: colorAsignado,
          weight: 1.5,
          opacity: 0.7,
          color: "#52525b", // Gris neutro oscuro para las líneas divisorias
          fillOpacity: 0.25
        };
      },
      onEachFeature: function(feature, layer) {
        const nombreZona = feature.properties?.name || feature.properties?.Territorio_N || "S/D";
        
        // Vinculamos un tooltip permanente en el centro geométrico del polígono
        layer.bindTooltip(`Zona ${nombreZona}`, {
          permanent: true,
          direction: 'center',
          className: 'label-territorio-mapa'
        });

        // Interacción táctil o clic sobre el territorio para el Administrador
        layer.on('click', function(e) {
          const comboFiltro = document.getElementById("busquedaTerritorio");
          if (comboFiltro) {
            comboFiltro.value = nombreZona;
            // Forzamos el filtrado cruzado automático de la grilla al tocar el mapa
            paginaActual = 1;
            if (typeof ejecutarFiltrosAdmin === 'function') {
              ejecutarFiltrosAdmin();
            } else {
              cargarEdificios();
            }
          }
        });
      }
    }).addTo(mapaGeneral);

    console.log("🗺️ Capa vectorial GeoJSON inyectada y parseada con éxito.");
  } catch (err) {
    console.error("Error al procesar la capa GeoJSON:", err);
  }
}

// =========================================================================
// 🔤 SECTOR: NORMALIZADOR ALFANUMÉRICO DE DIRECCIONES Y NOMENCLATURA VIAL
// =========================================================================

/**
 * Normaliza cadenas de texto borrando acentos, caracteres extraños y abreviaturas comunes.
 * Optimiza las búsquedas e impide fallas de inyección HTML o quiebres por comillas.
 * @param {string} texto - Dirección en bruto tipeada por el encuestador
 * @returns {string} Texto plano limpio listo para comparación indexada
 */
function normalizarDireccion(texto) {
  if (!texto) return "";
  
  return texto
    .toLowerCase()
    .trim()
    // Limpieza estricta de acentos y tildes (Normalización de caracteres de Posadas)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Homologación de abreviaturas urbanas comunes
    .replace(/\bav\b|\bavenida\b/g, "av")
    .replace(/\bc\b|\bcalle\b/g, "")
    .replace(/\bpsje\b|\bpasaje\b/g, "psje")
    // Reemplazo de puntuaciones y caracteres que rompen los selectores internos del DOM
    .replace(/['".,-]/g, " ")
    // Eliminación de espacios múltiples redundantes
    .replace(/\s+/g, " ");
}

// =========================================================================
// 🛠️ MÓDULO ADICIONAL: EDITOR EXPANDIDO DE EDIFICIOS (CREACIÓN / EDICIÓN)
// =========================================================================

/**
 * Prepara la pantalla de edición levantando los mapas y cargando datos preexistentes
 * @param {Object} objetoEdificio - Datos parciales o completos del registro
 */
function abrirEditorEdificio(objetoEdificio = {}) {
  // 1. Primero abrimos la vista para que el HTML se renderice en pantalla
  abrirVista("editarView");
  
  const inDir = document.getElementById("edit_address");
  const inNom = document.getElementById("edit_name");
  const inTerr = document.getElementById("edit_territory");
  const inId = document.getElementById("edit_building_id");

  if (inDir) inDir.value = objetoEdificio.address || "";
  if (inNom) inNom.value = objetoEdificio.name || "";
  if (inTerr) inTerr.value = objetoEdificio.territory || objetoEdificio.territorio || "";
  if (inId) inId.value = objetoEdificio.id || objetoEdificio._id || "";

  // 2. Le damos un delay más seguro (300ms) para garantizar que el div #mapaEditor ya exista en el DOM
  setTimeout(() => {
    const mapaContenedor = document.getElementById("mapaEditor");
    
    // 🛡️ CONTROL DE BLINDAJE: Si el div no existe en el HTML, frenamos para evitar el "Map container not found"
    if (!mapaContenedor) {
      console.error("❌ Error crítico: El contenedor HTML 'mapaEditor' no se encontró en la vista activa.");
      return;
    }

    const latBase = parseFloat(objetoEdificio.latitude || -27.36708);
    const lngBase = parseFloat(objetoEdificio.longitude || -55.89608);

    // Limpieza segura de instancias previas
    if (leafletMap) {
      try {
        leafletMap.off();
        leafletMap.remove();
      } catch (e) {
        console.warn("Aviso en limpieza de mapa:", e);
      }
      leafletMap = null;
    }

    // Inicializamos el mapa de forma segura
    console.log("🗺️ Inicializando 'mapaEditor' de forma segura...");
    leafletMap = L.map('mapaEditor', { zoomControl: true }).setView([latBase, lngBase], 15);
    
    // Capa clara de OpenStreetMap con nombres de calles legibles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(leafletMap);

    if (leafletMarker) { leafletMarker = null; }

    leafletMarker = L.marker([latBase, lngBase], { draggable: true }).addTo(leafletMap);

    // Al arrastrar el marcador guardamos dinámicamente las coordenadas físicas finales
    leafletMarker.on('dragend', function() {
      const pos = leafletMarker.getLatLng();
      console.log(`📌 Pin reposicionado: Lat ${pos.lat.toFixed(6)} | Lng ${pos.lng.toFixed(6)}`);
    });

    // Evento click único en la instancia para reubicar el pin de forma directa
    leafletMap.on('click', function(e) {
      if (leafletMarker) {
        leafletMarker.setLatLng(e.latlng);
      }
    });

    // Forzamos el recalculo del tamaño del mapa para que no salga gris o cortado
    setTimeout(() => { 
      if (leafletMap) leafletMap.invalidateSize(); 
    }, 150);

  }, 300); // Subimos a 300ms para darle tiempo al renderizado en móviles
}

/**
 * Captura el formulario del editor y emite la actualización (PUT) o creación (POST)
 */
async function guardarCambiosEditor() {
  const id = document.getElementById("edit_building_id")?.value;
  const address = document.getElementById("edit_address")?.value.trim();
  const name = document.getElementById("edit_name")?.value.trim();
  const territory = document.getElementById("edit_territory")?.value.trim();

  if (!address) {
    alert("⚠️ El campo de dirección física es mandatorio.");
    return;
  }

  const coords = leafletMarker ? leafletMarker.getLatLng() : { lat: 0, lng: 0 };

  const payload = {
    address,
    name,
    territory,
    latitude: coords.lat,
    longitude: coords.lng
  };

  const metodo = id ? "PUT" : "POST";
  const urlEndpoint = id ? `/buildings/${id}` : "/buildings";

  try {
    const res = await apiFetch(urlEndpoint, {
      method: metodo,
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert("💾 Datos guardados y sincronizados correctamente en la base central.");
      await preCargarBaseDatosEnMemoria();
      
      // Enrutamos de regreso al panel operativo según corresponda
      if (localStorage.getItem("role") === "admin") {
        abrirVista("dashboardView");
        cargarEdificios();
      } else {
        abrirVista("appContainer");
        limpiarVista();
      }
    } else {
      alert("❌ Ocurrió un error en el guardado. Compruebe las validaciones de campos.");
    }
  } catch (err) {
    console.error("Error crítico en envío de editor:", err);
  }
}

function cancelarEditor() {
  if (localStorage.getItem("role") === "admin") {
    abrirVista("dashboardView");
  } else {
    abrirVista("appContainer");
    limpiarVista();
  }
}

// =========================================================================
// 🚀 INICIALIZACIÓN AUTOMÁTICA AL CARGAR EL DOCUMENTO DOM
// =========================================================================

// 🚀 INICIALIZADOR BLINDADO DE ARRANCADO DIRECTO (Reemplaza al DOMContentLoaded viejo)
(function iniciarValidacionInmediata() {
  console.log("🔄 Inicializando núcleo de la aplicación de relevamiento...");

  // Forzamos la ejecución apenas el script se lee en el navegador
  const ejecutarControl = () => {
    const usuarioGuardado = localStorage.getItem("username");
    const rolGuardado = localStorage.getItem("role");

    // Caso 1: No hay sesión activa. Forzamos el Login limpio en pantalla.
    if (!usuarioGuardado || !rolGuardado) {
      console.log("ℹ️ Sin credenciales en memoria. Desplegando formulario de acceso.");
      localStorage.clear();

      const loginScreen = document.getElementById("loginScreen");
      if (loginScreen) {
        loginScreen.style.display = "block";
        loginScreen.classList.add("active");
      }

      // Apagamos el resto de las vistas de trabajo
      ["dashboardView", "appContainer", "editarView", "superAdminView"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = "none";
          el.classList.remove("active");
        }
      });
      return;
    }

    // Caso 2: El usuario ya estaba logueado de antes de forma válida
    currentRole = rolGuardado;
    console.log(`🔄 Sesión recuperada: ${usuarioGuardado} (${currentRole})`);

    const loginScreen = document.getElementById("loginScreen");
    if (loginScreen) loginScreen.style.display = "none";

    if (currentRole === "admin" || currentRole === "conductor") {
      abrirVista("dashboardView");
      setTimeout(() => {
        if (typeof inicializarMapaGeneralAdministrador === "function") inicializarMapaGeneralAdministrador();
        if (typeof cargarEdificios === "function") cargarEdificios();
      }, 100);
    } else {
      abrirVista("appContainer");
      if (typeof limpiarVista === "function") limpiarVista();
    }
  };

  // Se ejecuta inmediatamente, y por las dudas, se asegura si el documento ya está listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ejecutarControl);
  } else {
    ejecutarControl();
  }
})();
