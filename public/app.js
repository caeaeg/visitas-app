// =========================================================================
// 🚀 PARTE 1: CONFIGURACIÓN ESTRUCTURAL, ESTADOS GLOBALES Y ENRUTADOR DE VISTAS
// =========================================================================

/**
 * 1. CONFIGURACIÓN COMPORTAMENTAL DEL ENTORNO DE RED
 * Establece el punto de enlace base por defecto alineado con el despliegue central.
 */
const API_BASE_URL = "https://visitas-app-inxa.onrender.com"; 

/**
 * 2. CONTROL DE SESIÓN Y VARIABLES DE ENTORNO EN TIEMPO REAL
 * Variables globales mandatorias compartidas por los módulos de autenticación y lógica.
 */
let currentUser = localStorage.getItem("username") || localStorage.getItem("user") || "";
let currentRole = localStorage.getItem("role") || "";
let paginaActual = 1;
const ELEMENTOS_POR_PAGINA = 10;

/**
 * 3. REFERENCIAS Y NÚCLEO GEOGRÁFICO (LEAFLET)
 * Instancias de control para el despliegue, marcadores y agrupamientos de mapas.
 */
let leafletMap = null;          // Instancia transaccional utilizada en el formulario de edición
let leafletMarker = null;       // Marcador arrastrable (Draggable) del formulario de edición
let map = null;                 // Instancia del mapa principal del panel administrativo
let prediMiniMap = null;        // Instancia del mapa opcional adaptado a la visualización móvil
let markerClusterGroup = null;  // Contenedor lógico para el empaquetado de marcadores masivos anterior
let mapaGeneral = null;         // ✨ Instancia maestra unificada del mapa (Admin / General)
let marcadoresClusterGlobal = null; // ✨ Grupo de clústeres dinámicos translúcidos Dark Mode

/**
 * 4. ESTRATOS DE PERSISTENCIA Y FLUJO EN MEMORIA VOLÁTIL
 * Buffers e índices globales compartidos por el motor de relevamiento y paneles.
 */
window.todosLosEdificiosDB = [];       // Pool central de sincronización de la base de datos
window.baseDatosEdificiosMemoria = []; // Caché unificado para roles de administración y conducción
window.edificiosEncontrados = [];      // Resultados temporales del motor de búsqueda predictiva
window.indiceEdificioActual = 0;       // Índice activo del carrusel en el visor móvil del predi
window.currentBuildingId = null;       // Identificador transaccional del edificio en foco operativo
window.edificioActivo = null;          // Objeto completo del edificio cargado en la sesión de campo
window.departamentoEnFoco = null;      // Estructura relacional del departamento bajo análisis ({ _id, number })

// Controladores avanzados de sincronización visual (Compatibilidad de ventanas y sub-mapas)
let miTemporizadorMapa = null;         // ✨ Declaración limpia para el delay de redimensionamiento (InvalidateSize)
let miniMapaAdminInstance = null;      // ✨ Instancia aislada limpia para previsualizaciones secundarias

// Estados específicos asignados al subsistema SuperAdmin
window.superAdminAutenticado = false;
window.superAdminPaginaActual = 1;
window.superAdminFiltrados = [];

/**
 * 5. CAPTURA DINÁMICA BLINDADA DEL DOM
 * Acceso seguro a componentes del visor de campo. Evita inicializaciones nulas prematuras.
 */
const UI = {
  get resultado() { return document.getElementById("resultado"); },
  get infoEdificio() { return document.getElementById("infoEdificio"); },
  get nota() { return document.getElementById("nota"); },
  get btnOk() { return document.getElementById("btnOk"); },
  get btnNo() { return document.getElementById("btnNo"); },
  get btnSiguiente() { return document.getElementById("btnSiguiente"); },
  get btnNuevoEdificio() { return document.getElementById("btnNuevoEdificio"); },
  get reportBtn() { return document.getElementById("reportBtn"); },
  get loadingBar() { return document.getElementById("loadingBar"); }
};

// =========================================================================
// 🔐 SECTOR: CONTROL DE ACCESO, COMUNICACIÓN CENTRALIZADA Y CONTROL DE VISTAS
// =========================================================================

/**
 * 1. ENVOLTURA DE COMUNICACIÓN SEGURA (API FETCH INTEGRADO)
 * Centraliza las peticiones al backend resolviendo URL base, headers automáticos de rol,
 * manejo visual de barras de progreso y ruteo forzado por expiración de credenciales.
 */
async function apiFetch(endpoint, options = {}) {
  const username = localStorage.getItem('username') || localStorage.getItem('user');
  const role = localStorage.getItem('role');
  
  if (username) currentUser = username;
  if (role) currentRole = role;
  
  const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://visitas-app-inxa.onrender.com';

  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  options.headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (username && role) {
    options.headers['x-user'] = username;
    options.headers['x-role'] = role;
  }

  const lBar = document.getElementById("loadingBar");
  if (lBar) lBar.style.width = "30%";

  try {
    const response = await fetch(url, options);
    
    if (lBar) lBar.style.width = "100%";
    setTimeout(() => { 
      if (lBar) lBar.style.width = "0%"; 
    }, 400);

    if (response.status === 401 || response.status === 403) {
      console.warn("🔐 Credenciales inválidas o sin permisos. Redireccionando...");
      logout();
      return response;
    }

    return response;
  } catch (error) {
    if (lBar) lBar.style.width = "0%";
    console.error("❌ Error físico de red en apiFetch:", error);
    throw error;
  }
}

/**
 * 2. ESTRUCTURADOR DE CABECERAS
 */
function obtenerHeadersSeguros() {
  return {
    "Content-Type": "application/json",
    "x-user": localStorage.getItem("username") || localStorage.getItem("user") || "",
    "x-role": localStorage.getItem("role") || ""
  };
}

/**
 * 3. CONTROLADOR VISUAL DE ESPERA (SPINNER)
 */
function mostrarLoading(mostrar) {
  const spinner = document.getElementById("loading") || document.getElementById("loadingSpinner");
  if (spinner) {
    spinner.style.display = mostrar ? "flex" : "none";
  } else {
    document.body.style.cursor = mostrar ? "wait" : "default";
  }
}

/**
 * 4. PROCESADOR DE LOGEO CENTRAL
 */
async function login() {
  const userField = document.getElementById("loginUser");
  const passField = document.getElementById("loginPass");
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

    localStorage.setItem("username", datos.username);
    localStorage.setItem("user", datos.username);
    localStorage.setItem("role", datos.role);
    
    currentUser = datos.username;
    currentRole = datos.role;

    console.log(`🔑 Sesión iniciada con éxito. Usuario: ${currentUser}, Rol: ${currentRole}`);
    
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

/**
 * 5. ORQUESTADOR DE ENTORNO SEGÚN PERMISOS Y ROLES DE TRABAJO
 * Modula la UI adaptándola de forma exacta al Publicador, Conductor o Admin.
 */
async function iniciarAppConPermisos() {
  const elLogin = document.getElementById("loginScreen");
  const navbar = document.getElementById("navbarGlobal");
  const badge = document.getElementById("badge-rol-usuario");
  const btnSuperAdmin = document.getElementById("btnSuperAdminMenu");

  if (elLogin) elLogin.style.display = "none";
  if (navbar) navbar.style.display = "flex";
  
  if (typeof aplicarPermisos === "function") aplicarPermisos();

  if (currentRole === "predi") {
    // 🚪 USUARIO PREDI (PUBLICADOR): Va directo puerta a puerta, visor móvil directo en tiempo real.
    if (badge) badge.innerText = "Publicador (Predi)";
    if (btnSuperAdmin) btnSuperAdmin.style.display = "none";
    
    window.baseDatosEdificiosMemoria = [];
    console.log("⚡ Entorno PUBLICADOR (Puerta a puerta) configurado. Visor móvil activo.");
    
    if (typeof limpiarVista === "function") limpiarVista();
    abrirVista("appContainer");

  } else if (currentRole === "conductor") {
    // 🧭 USUARIO CONDUCTOR: Capitanea un grupo, ve el mapa y estadísticas pero NO SuperAdmin.
    if (badge) badge.innerText = "Conductor de Grupo";
    if (btnSuperAdmin) btnSuperAdmin.style.display = "none";
    
    console.log("🗺️ Entorno CONDUCTOR (Líder de Grupo) configurado. Cargando panel operativo.");
    await descargarBaseAdministrativa();
    abrirVista("dashboardView");

  } else if (currentRole === "admin") {
    // 👑 USUARIO ADMIN: Administrador total del sistema.
    if (badge) badge.innerText = "Administrador";
    if (btnSuperAdmin) btnSuperAdmin.style.display = "flex";
    
    console.log("👑 Entorno ADMINISTRADOR TOTAL activo.");
    await descargarBaseAdministrativa();
    abrirVista("dashboardView");
  }
}

/**
 * 6. RECOLECTOR MASIVO DE DATOS ADMINISTRATIVOS
 */
async function descargarBaseAdministrativa() {
  try {
    console.log("⏳ Sincronizando datos administrativos con el servidor...");
    const respuesta = await apiFetch('/admin/buildings?all=true', { method: "GET" });
    if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);

    const resultado = await respuesta.json();
    window.baseDatosEdificiosMemoria = resultado.data || [];
    window.todosLosEdificiosDB = window.baseDatosEdificiosMemoria;
    console.log(`✅ Sincronización exitosa. ${window.baseDatosEdificiosMemoria.length} edificios cargados.`);
  } catch (error) {
    console.warn("⚠️ Error en precarga masiva:", error.message);
    window.baseDatosEdificiosMemoria = []; 
  }
}

/**
 * 7. ENRUTADOR DINÁMICO DE PANTALLAS (PROTECCIÓN ESTRICTA POR ROL)
 */
function abrirVista(vistaId) {
  if (currentRole === "predi" && vistaId !== "editarView" && vistaId !== "appContainer") {
    abrirVista("appContainer");
    return;
  }

  const vistas = ["loginScreen", "dashboardView", "territorioView", "problemasView", "appContainer", "editarView", "superAdminView"];
  
  vistas.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === vistaId) {
        el.style.display = "block";
        el.classList.add("active");
      } else {
        el.style.display = "none";
        el.classList.remove("active");
      }
    }
  });

  const navbar = document.getElementById("navbarGlobal");
  const btnVolver = document.getElementById("btnVolverNavbar");

  if (vistaId === "loginScreen") {
    if (navbar) navbar.style.display = "none";
  } else {
    if (navbar) navbar.style.display = "flex";
    if (vistaId === "dashboardView" || vistaId === "appContainer") {
      if (btnVolver) btnVolver.style.display = "none";
    } else {
      if (btnVolver) btnVolver.style.display = "block";
    }
  }

  if (vistaId === "territorioView") {
    setTimeout(() => {
      if (typeof inicializarMapaGeneralAdministrador === "function") {
        inicializarMapaGeneralAdministrador();
      }
      if (typeof ejecutarFiltrosAdmin === "function") {
        ejecutarFiltrosAdmin();
      }
    }, 100);
  }

  if (vistaId === "territorioView" && typeof mapaGeneral !== 'undefined' && mapaGeneral) {
    setTimeout(() => { mapaGeneral.invalidateSize(); }, 200);
  }
}

/**
 * 8. CIERRE DE SESIÓN
 */
function logout() {
  const buscador = document.getElementById("buildingId");
  if (buscador) buscador.value = "";

  localStorage.clear();
  currentUser = "";
  currentRole = "";
  window.todosLosEdificiosDB = [];
  window.baseDatosEdificiosMemoria = [];
  window.edificiosEncontrados = [];
  
  if (typeof limpiarVista === "function") limpiarVista();

  abrirVista("loginScreen");
}

/**
 * 9. RECEPTOR DE CARGA DEL DOCUMENTO Y ESCANEO QR
 */
window.addEventListener("load", async () => {
  const savedUser = localStorage.getItem("username") || localStorage.getItem("user");
  const savedRole = localStorage.getItem("role");
  
  if (savedUser && savedRole) {
    currentUser = savedUser;
    currentRole = savedRole;
    console.log(`🔄 Restaurando sesión activa para: ${currentUser} (${currentRole})`);
    await iniciarAppConPermisos();
  } else {
    abrirVista("loginScreen");
  }
  
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

/**
 * 10. INICIALIZADOR INMEDIATO AUTOCONVOCADO
 */
(function iniciarValidacionInmediata() {
  console.log("🔄 Inicializando núcleo de la aplicación...");

  const ejecutarControl = () => {
    const usuarioGuardado = localStorage.getItem("username");
    const rolGuardado = localStorage.getItem("role");

    if (!usuarioGuardado || !rolGuardado) {
      localStorage.clear();
      const loginScreen = document.getElementById("loginScreen");
      if (loginScreen) {
        loginScreen.style.display = "block";
        loginScreen.classList.add("active");
      }
      const navbar = document.getElementById("navbarGlobal");
      if (navbar) navbar.style.display = "none";

      ["dashboardView", "territorioView", "problemasView", "appContainer", "editarView", "superAdminView"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = "none";
          el.classList.remove("active");
        }
      });
      return;
    }

    currentRole = rolGuardado;
    currentUser = usuarioGuardado;

    const loginScreen = document.getElementById("loginScreen");
    if (loginScreen) loginScreen.style.display = "none";

    const navbar = document.getElementById("navbarGlobal");
    const badge = document.getElementById("badge-rol-usuario");
    const btnSuperAdmin = document.getElementById("btnSuperAdminMenu");

    if (navbar) navbar.style.display = "flex";

    if (currentRole === "admin") {
      if (badge) badge.innerText = "Administrador";
      if (btnSuperAdmin) btnSuperAdmin.style.display = "flex";
      abrirVista("dashboardView");
    } else if (currentRole === "conductor") {
      if (badge) badge.innerText = "Conductor de Grupo";
      if (btnSuperAdmin) btnSuperAdmin.style.display = "none";
      abrirVista("dashboardView");
    } else if (currentRole === "predi") {
      if (badge) badge.innerText = "Publicador (Predi)";
      if (btnSuperAdmin) btnSuperAdmin.style.display = "none";
      abrirVista("appContainer");
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ejecutarControl);
  } else {
    ejecutarControl();
  }
})();

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

/** * 3. CONTROLADOR INTERFAZ FLUJO MÓVIL  * Sincroniza la visibilidad y limpia los paneles de index.html para iniciar la votación.  */

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

  // 🎨 APAGADO PREVENTIVO GHOST: Apaga los botones individuales para el nuevo departamento entrante
  document.getElementById("btnOk")?.classList.remove("seleccionado");
  document.getElementById("btnNo")?.classList.remove("seleccionado");

  // 🔥 NUEVO: Encendemos el contenedor general de la botonera envoltura
  const botonera = document.getElementById("botoneraVotacion");
  if (botonera) botonera.style.display = "flex";

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
 * Aplica encendido dinámico sólido sobre estilos Ghost en Modo Oscuro.
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

  // 🎨 CONTROL VISUAL GHOST: Captura de botones y encendido inteligente
  const btnOk = document.getElementById("btnOk");
  const btnNo = document.getElementById("btnNo");

  if (btnOk) btnOk.classList.remove("seleccionado");
  if (btnNo) btnNo.classList.remove("seleccionado");

  if (estado === "ATENDIO" && btnOk) {
    btnOk.classList.add("seleccionado");
    console.log("🟢 Interfaz: Botón 'ATENDIÓ' encendido en verde sólido.");
  } else if (estado === "NO_EN_CASA" && btnNo) {
    btnNo.classList.add("seleccionado");
    console.log("🔴 Interfaz: Botón 'NO EN CASA' encendido en rojo sólido.");
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



// =========================================================================
// 🛠️ MÓDULO ADICIONAL: EDITOR EXPANDIDO DINÁMICO (CREACIÓN / EDICIÓN)
// =========================================================================

/**
 * 1. INTERRUPTOR VISUAL DE EXCEPCIONES
 * Oculta paneles y despliega opciones de rescate en caso de direcciones inexistentes.
 */
function tratarEdificioNoEncontrado() {
  const resLabel = document.getElementById("resultado");
  const btnNuevo = document.getElementById("btnNuevoEdificio");
  const deptoLabel = document.getElementById("departamentoVisitar");
  const inputCampo = document.getElementById("buildingId");
  
  if (resLabel) {
    resLabel.innerHTML = `<div style="color:#ef4444; text-align:center; padding:10px; font-weight:bold;">Edificio no encontrado</div>`;
  }
  if (deptoLabel) deptoLabel.innerText = "--";
  
  if (btnNuevo) {
    btnNuevo.style.setProperty("display", "block", "important");
    btnNuevo.onclick = function() {
      const direccionIngresada = inputCampo ? inputCampo.value.trim() : "";
      console.log(`➕ Pasarela de rescate: Abriendo editor dinámico para "${direccionIngresada}"`);
      abrirEditorEdificio({ address: direccionIngresada });
    };
  }
  
  if (document.getElementById("nota")) document.getElementById("nota").style.display = "none";
  if (document.getElementById("btnOk")) document.getElementById("btnOk").style.display = "none";
  if (document.getElementById("btnNo")) document.getElementById("btnNo").style.display = "none";
  if (document.getElementById("infoEdificio")) document.getElementById("infoEdificio").style.display = "none";
}

/**
 * 2. APERTURA Y RENDERIZADO DEL EDITOR
 * Prepara e inyecta la pantalla de edición ocultando de raíz la interfaz del predi y sin botones flotantes sobrantes.
 */
function abrirEditorEdificio(objetoEdificio = null) {
  // CONFIGURACIÓN EXTRA: Si lo que nos pasaron es un texto (el ID) en lugar de un objeto, lo buscamos en la base de datos de memoria
  if (typeof objetoEdificio === "string") {
    const idBuscado = objetoEdificio;
    objetoEdificio = (window.todosLosEdificiosDB || []).find(e => (e.id === idBuscado || e._id === idBuscado)) || null;
  }
  // Apagamos los contenedores principales para evitar superposiciones
  const appContainer = document.getElementById("appContainer");
  const dashboardView = document.getElementById("dashboardView");
  
  if (appContainer) appContainer.style.setProperty("display", "none", "important");
  if (dashboardView) dashboardView.style.setProperty("display", "none", "important");

  // Activamos la vista del editor
  abrirVista("editarView");
  
  const userRole = localStorage.getItem("role") || "predi";
  const funcionCancelar = (userRole === "predi") ? "cancelarEdificioMovil()" : "abrirVista('dashboardView')";
  const esNuevo = !objetoEdificio || !(objetoEdificio.id || objetoEdificio._id);
  const direccionSugerida = esNuevo ? (document.getElementById('buildingId')?.value || '') : '';

  // Inyectamos el HTML con el diseño limpio y los campos recuperados
  let htmlContenido = `
    <div class="card-container" style="padding: 20px; max-width: 500px; margin: 0 auto; text-align: left;">
      <h3 style="margin-top:0; color:#fff; font-size: 20px; letter-spacing: -0.5px;">
        ${esNuevo ? "➕ Nuevo edificio" : "✏️ Editar edificio"}
      </h3>
      
      <input type="hidden" id="edit_building_id" value="${objetoEdificio?.id || objetoEdificio?._id || ''}">
      
      <label style="font-size:12px; color:#a1a1aa; display:block; margin-top:8px;">Dirección Principal (Obligatoria)</label>
      <input id="edit_address" placeholder="Ej: Corrientes 2223" value="${objetoEdificio?.address || direccionSugerida}" style="width:100%; margin-bottom:8px; padding:10px; border-radius:8px;">
      
      <label style="font-size:12px; color:#a1a1aa; display:block;">Dirección 2 / Detalles de ubicación</label>
      <input id="edit_address2" placeholder="Ej: Esquina San Martín" value="${objetoEdificio?.address2 || ''}" style="width:100%; margin-bottom:8px; padding:10px; border-radius:8px;">
      
      <label style="font-size:12px; color:#a1a1aa; display:block;">Nombre del Edificio / Referencia</label>
      <input id="edit_name" placeholder="Ej: Torre del Sol" value="${objetoEdificio?.name || ''}" style="width:100%; margin-bottom:8px; padding:10px; border-radius:8px;">
      
      <div style="display:flex; gap:10px; margin-bottom:8px;">
        <div style="flex:1;">
          <label style="font-size:12px; color:#a1a1aa; display:block;">Territorio</label>
          <input id="edit_territory" type="number" placeholder="N°" value="${objetoEdificio?.territory || objetoEdificio?.territorio || ''}" style="width:100%; padding:10px; border-radius:8px;">
        </div>
        <div style="flex:1;">
          <label style="font-size:12px; color:#a1a1aa; display:block;">Pisos</label>
          <input id="edit_floors" type="number" placeholder="Pisos" value="${objetoEdificio?.floors || ''}" style="width:100%; padding:10px; border-radius:8px;">
        </div>
        <div style="flex:1;">
          <label style="font-size:12px; color:#a1a1aa; display:block;">Deptos x Piso</label>
          <input id="edit_units" type="number" placeholder="Cant." value="${objetoEdificio?.unitsPerFloor || ''}" style="width:100%; padding:10px; border-radius:8px;">
        </div>
      </div>

      <div style="display:flex; gap:20px; margin: 12px 0; background:#1c1c1e; padding:10px; border-radius:8px;">
        <label style="color:#fff; font-size:14px; cursor:pointer;">
          <input type="checkbox" id="edit_pb" ${objetoEdificio?.hasGroundFloor ? 'checked' : ''}> Planta Baja
        </label>
        <label style="color:#fff; font-size:14px; cursor:pointer;">
          <input type="checkbox" id="edit_portero" ${objetoEdificio?.hasDoorman ? 'checked' : ''}> Portero Eléctrico
        </label>
      </div>
      
      <label style="font-size:12px; color:#a1a1aa; display:block;">Descripción / Notas del Edificio</label>
      <textarea id="edit_description" placeholder="Notas operativas para ingresar..." rows="3" style="width:100%; margin-bottom:12px; padding:10px; border-radius:8px; background:#2c2c2e; border:1px solid #3a3a3c; color:#fff; resize:none;">${objetoEdificio?.description || ''}</textarea>
      
      <input type="hidden" id="edit_lat" value="${objetoEdificio?.latitude || ''}">
      <input type="hidden" id="edit_lng" value="${objetoEdificio?.longitude || ''}">

      <p style="font-size:13px; margin: 5px 0; color:#a1a1aa;">📍 Arrastrá el marcador para fijar la ubicación exacta:</p>
      <div id="mapaEditor" class="mapaBox" style="height:200px; border-radius:12px; margin-bottom:15px; border:1px solid #3f3f46;"></div>
      
      <button class="ok" onclick="guardarCambiosEditor()" style="width:100%; margin-bottom:10px; font-weight:bold; padding:12px;">💾 Guardar Edificio</button>
      <button class="secondary" onclick="${funcionCancelar}" style="width:100%; margin:0; padding:10px;">❌ Cancelar</button>
    </div>
  `;

  // 🟢 CORRECCIÓN: Se remueve la flecha flotante superior para evitar duplicación estética
  document.getElementById("editarView").innerHTML = htmlContenido;

  // Despliegue de mapa Leaflet coordinado
  setTimeout(() => {
    const mapaContenedor = document.getElementById("mapaEditor");
    if (!mapaContenedor) return;

    const latBase = parseFloat(objetoEdificio?.latitude || -27.36708);
    const lngBase = parseFloat(objetoEdificio?.longitude || -55.89608);

    document.getElementById('edit_lat').value = latBase;
    document.getElementById('edit_lng').value = lngBase;

    if (leafletMap) {
      try {
        leafletMap.off();
        leafletMap.remove();
      } catch (e) { console.warn(e); }
      leafletMap = null;
    }

    leafletMap = L.map('mapaEditor', { zoomControl: true }).setView([latBase, lngBase], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(leafletMap);
    leafletMarker = L.marker([latBase, lngBase], { draggable: true }).addTo(leafletMap);

    leafletMarker.on('dragend', function() {
      const pos = leafletMarker.getLatLng();
      document.getElementById('edit_lat').value = pos.lat;
      document.getElementById('edit_lng').value = pos.lng;
    });

    leafletMap.on('click', function(e) {
      if (leafletMarker) {
        leafletMarker.setLatLng(e.latlng);
        document.getElementById('edit_lat').value = e.latlng.lat;
        document.getElementById('edit_lng').value = e.latlng.lng;
      }
    });

    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 150);
  }, 250);
}

/** * 3. RETORNO DE INTERFAZ MÓVIL * Función de escape definitiva: Desactiva el editor de raíz y acopla el display del predi. */

function cancelarEdificioMovil() {
  console.log("🚪 Ejecutando salida limpia del editor...");

  const editarView = document.getElementById("editarView");
  if (editarView) {
    editarView.innerHTML = ""; 
    editarView.classList.remove("active");
    editarView.style.setProperty("display", "none", "important");
  }

  const appContainer = document.getElementById("appContainer");
  if (appContainer) {
    appContainer.style.setProperty("display", "block", "important");
  }
  
  if (typeof limpiarVista === "function") {
    limpiarVista();
  }
  
  // 🌟 AGREGAMOS ESTO: Forzamos la limpieza para que no queden bloqueos residuales
  forzarReinicioBuscador();
  
  const msgInicial = document.getElementById("mensajeInicial");
  if (msgInicial) msgInicial.style.setProperty("display", "block", "important");
}

/** * 4. PERSISTENCIA EN SERVIDOR CENTRAL
 * Procesa y emite los datos del formulario extendido al servidor central. 
 */
async function guardarCambiosEditor() {
  const id = document.getElementById("edit_building_id")?.value;
  const address = document.getElementById("edit_address")?.value.trim();
  const address2 = document.getElementById("edit_address2")?.value.trim();
  const name = document.getElementById("edit_name")?.value.trim();
  const territory = document.getElementById("edit_territory")?.value.trim();
  const floors = parseInt(document.getElementById("edit_floors")?.value) || 0;
  const unitsPerFloor = parseInt(document.getElementById("edit_units")?.value) || 0;
  const latitude = parseFloat(document.getElementById("edit_lat")?.value) || -27.36708;
  const longitude = parseFloat(document.getElementById("edit_lng")?.value) || -55.89608;
  const hasGroundFloor = document.getElementById("edit_pb")?.checked || false;
  const hasDoorman = document.getElementById("edit_portero")?.checked || false;
  const description = document.getElementById("edit_description")?.value.trim();

  if (!address) {
    alert("⚠️ El campo de dirección física es mandatorio.");
    return;
  }

  // Empaquetamos la estructura exacta del backend para edificios
  const payload = {
    address,
    address2,
    name,
    territory,
    floors,
    unitsPerFloor,
    latitude,
    longitude,
    hasGroundFloor,
    hasDoorman,
    description
  };

  const metodo = id ? "PUT" : "POST";
  const urlEndpoint = id ? `/building/${id}` : "/building";

  console.log("📦 ENVIANDO ALTA DE EDIFICIO:", payload);

  try {
    const res = await apiFetch(urlEndpoint, {
      method: metodo,
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert("Edificio guardado exitosamente");
      if (typeof preCargarBaseDatosEnMemoria === "function") await preCargarBaseDatosEnMemoria();
      
      const userRole = localStorage.getItem("role") || "predi";
      if (userRole === "admin") {
        abrirVista("dashboardView");
        if (typeof cargarEdificios === "function") cargarEdificios();
      } else {
        cancelarEdificioMovil();
      }
    } else {
      const data = await res.json().catch(() => ({}));
      alert("Error: " + (data.message || "Error desconocido en el servidor"));
    }
  } catch (err) {
    console.error("Error crítico al guardar el edificio:", err);
    alert("Error crítico en comunicación con servidor.");
  }
}

// =========================================================================
// 🪟 CONTROLADORES DE MODALES: REPORTES DE PROBLEMAS / INCIDENCIAS (CON RETORNO OFFLINE)
// =========================================================================

/** * 1. ENRUTADOR DE ACCESO GLOBAL * Mapea el evento inline onclick="abrirReporte()" del HTML apuntando * directamente al contenedor con ID real de tu interfaz. */

function abrirReporte() { 
  if (!window.currentBuildingId) {
    alert("⚠️ Error: Debe seleccionar o buscar un edificio antes de reportar un problema.");
    return;
  }

  console.log("📋 Abriendo pasarela de incidencias críticas...");
  
  if (typeof modalReporte !== 'undefined' && modalReporte) {
    modalReporte.style.setProperty("display", "flex", "important"); 
  } else {
    const modal = document.getElementById("modalReporte");
    if (modal) modal.style.setProperty("display", "flex", "important");
  }

  // Auto-foco en la caja de descripción si existe
  if (typeof descProblema !== 'undefined' && descProblema) {
    descProblema.value = "";
    descProblema.focus();
  }
}

/**
 * 2. RECEPTOR DE CIERRE DE INTERFAZ
 * Oculta el modal de reportes restableciendo el flujo operativo visual.
 */
function cerrarReporte() { 
  if (typeof modalReporte !== 'undefined' && modalReporte) {
    modalReporte.style.display = "none"; 
  } else {
    const modal = document.getElementById("modalReporte");
    if (modal) modal.style.display = "none";
  }
}

/** * 3. DESPACHADOR CENTRAL DE REPORTES (BLINDADO SIN INTERNET) * Recoge los selectores reales del HTML, valida campos mandatorios, evalúa la * conectividad del dispositivo y resguarda datos localmente si falla la señal. */

async function enviarReporte() {
  // Captura dinámica de descripción resguardando variables globales del DOM
  const txtArea = typeof descProblema !== 'undefined' ? descProblema : document.getElementById("descProblema");
  const descripcion = txtArea ? txtArea.value.trim() : "";
  
  // Captura de los selectores añadidos en el index.html
  const inputNombre = document.getElementById("edit_nombre_reporta");
  const nombreReporta = inputNombre ? inputNombre.value.trim() : "";
  
  const selectorTipo = document.getElementById("tipoProblema");
  const tipo = selectorTipo ? selectorTipo.value : "Otro";

  // 1. Validaciones preventivas de datos obligatorios
  if (!nombreReporta) {
    alert("Por favor, introduce tu nombre para saber quién reporta el problema.");
    return;
  }
  if (!descripcion) {
    alert("Por favor, escribe los detalles del problema antes de enviar.");
    return;
  }

  // 2. Extracción y normalización segura del ID del edificio en foco
  let idEdificioLimpia = window.currentBuildingId;
  if (window.currentBuildingId && typeof window.currentBuildingId === 'object') {
    idEdificioLimpia = window.currentBuildingId._id || window.currentBuildingId.id;
  }

  if (!idEdificioLimpia || idEdificioLimpia === "[object Object]") {
    alert("Error local: No se pudo identificar el edificio actual. Intenta recargar la página del edificio.");
    return;
  }

  // 3. Mapeo relacional del departamento en foco operativo
  
  const deptoId = window.departamentoEnFoco ? window.departamentoEnFoco._id : (typeof currentDept !== 'undefined' ? currentDept?._id : null);
  const deptoNum = window.departamentoEnFoco ? window.departamentoEnFoco.number : (typeof currentDept !== 'undefined' ? currentDept?.number : null);

  // Armamos el paquete de datos estructurado idéntico a tu esquema backend
  const datosReporte = {
    buildingId: idEdificioLimpia, 
    departmentId: deptoId,
    departmentNumber: deptoNum, 
    type: tipo,
    description: descripcion,
    reportedBy: nombreReporta, 
    status: "PENDIENTE" 
  };

  console.log("🚀 Procesando reporte con ID de edificio:", idEdificioLimpia);

  // 🛰️ CASO A: El teléfono está sin conexión a internet de antemano
  if (!navigator.onLine) {
    if (typeof guardarEnMochilaLocal === "function") {
      guardarEnMochilaLocal("reportes_pendientes", datosReporte);
    } else {
      console.warn("⚠️ No se encontró la función 'guardarEnMochilaLocal' para el respaldo offline.");
    }
    
    cerrarReporte();
    if (txtArea) txtArea.value = "";
    if (inputNombre) inputNombre.value = ""; 
    alert("⚠️ Guardado localmente (Sin Internet). El reporte de problemas se enviará solo cuando recuperes señal.");
    return;
  }

  // 💻 CASO B: Transmisión directa por red usando apiFetch unificado
  try {
    const res = await apiFetch("/issues", {
      method: "POST",
      body: JSON.stringify(datosReporte)
    });

    if (res.ok) {
      cerrarReporte();
      if (txtArea) txtArea.value = "";
      if (inputNombre) inputNombre.value = ""; 
      alert("Reporte enviado con éxito al panel de control.");
      
      if (typeof mostrarInfoEdificio === "function") {
        await mostrarInfoEdificio();
      } else if (typeof mostrarEdificioActual === "function") {
        mostrarEdificioActual();
      }
    } else {
      const errorData = await res.json().catch(() => ({}));
      alert("No se pudo enviar el reporte: " + (errorData.error || "Error en el servidor"));
    }
  } catch (error) {
    console.error("Error crítico al enviar reporte, respaldando en almacenamiento secundario...", error);
    
    // Rescate de emergencia por micro-cortes de red en plena subida
    if (typeof guardarEnMochilaLocal === "function") {
      guardarEnMochilaLocal("reportes_pendientes", datosReporte);
    }
    
    cerrarReporte();
    if (txtArea) txtArea.value = "";
    if (inputNombre) inputNombre.value = ""; 
    alert("⏳ Problema temporal de red. El reporte quedó guardado de forma segura en tu celu y se reenviará automáticamente.");
  }
}

/** * 4. REINICIO COMPORTAMENTAL DE INTERFAZ MÓVIL * Vacía y oculta los paneles del visor usando el objeto seguro UI. */
function limpiarVista() {
  // 🚫 REMOVEMOS el borrado de buildingId de acá para que no interfiera al buscar 🚫

  if (UI.resultado) UI.resultado.innerHTML = "";
  if (UI.infoEdificio) UI.infoEdificio.style.display = "none";
  if (UI.reportBtn) UI.reportBtn.style.display = "none";
  if (UI.btnNuevoEdificio) UI.btnNuevoEdificio.style.display = "none";
  
  // 🎨 COMPLEMENTO GHOST: Apagamos y ocultamos los controles de votación y notas
  const botonera = document.getElementById("botoneraVotacion");
  if (botonera) botonera.style.display = "none";

  const nota = document.getElementById("nota");
  if (nota) nota.style.display = "none";

  const btnSiguiente = document.getElementById("btnSiguiente");
  if (btnSiguiente) {
    btnSiguiente.style.visibility = "hidden";
    btnSiguiente.style.display = "none";
  }

  // Reseteamos las clases de selección por seguridad
  document.getElementById("btnOk")?.classList.remove("seleccionado");
  document.getElementById("btnNo")?.classList.remove("seleccionado");

  if (prediMiniMap) {
    try {
      prediMiniMap.off();
      prediMiniMap.remove();
    } catch (e) {
      console.warn("Aviso al remover mapa móvil:", e);
    }
    prediMiniMap = null;
  }
  window.currentBuildingId = null;
  console.log("🧼 Interfaz del visor móvil restablecida de forma segura (Limpieza completa).");
}

/**
 * =========================================================================
 * 💼 SECCIÓN 6: PANEL DE ADMINISTRACIÓN, PAGINACIÓN, MODALES Y SUPERADMIN
 * =========================================================================
 * Este módulo unifica el renderizado de la grilla operativa del Administrador,
 * los controles de paginación optimizados en memoria, el control de modales de
 * detalle técnico, auditorías de visitas y la consola avanzada con clave maestra. */

/**
 * 6.1 RENDERIZADO DE LA GRILLA OPERATIVA DEL ADMINISTRADOR
 * Optimizado: Fila completa cliqueable para ver detalles, eliminando botones redundantes.
 */
async function cargarEdificios() {
  const tablaCuerpo = document.getElementById("tablaEdificiosCuerpo");
  if (!tablaCuerpo) return;

  // RESTRICCIÓN: Validamos si el usuario escribió algo en los campos de búsqueda
  const TXT_DIR = document.getElementById("busquedaDireccionAdmin")?.value.trim() || "";
  const TXT_TERR = document.getElementById("busquedaTerritorio")?.value.trim() || "";

  // Si ambos campos están vacíos, forzamos que permanezca el mensaje instructivo y salimos
  if (TXT_DIR === "" && TXT_TERR === "") {
    tablaCuerpo.innerHTML = `
      <tr>
        <td style="text-align: center; color: #71717a; padding: 20px;">
          🔍 Introduzca un término en el buscador superior para desplegar resultados.
        </td>
      </tr>
    `;
    actualizarControlesPaginacion(0);
    return;
  }

  tablaCuerpo.innerHTML = "";

  // Si no hay datos cargados, intentamos una sincronización rápida
  if (!window.todosLosEdificiosDB || window.todosLosEdificiosDB.length === 0) {
    if (typeof preCargarBaseDatosEnMemoria === 'function') {
      await preCargarBaseDatosEnMemoria();
    }
  }

  const datosAIterar = window.todosLosEdificiosDB || [];

  if (datosAIterar.length === 0) {
    tablaCuerpo.innerHTML = `<tr><td style="text-align:center; color:#a1a1aa; padding:20px;">📭 No hay edificios registrados en el sistema.</td></tr>`;
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

    // Configuración de la fila como un botón interactivo completo
    fila.style.cursor = "pointer";
    fila.style.transition = "background-color 0.2s ease";
    fila.setAttribute("onclick", `verDetalleEdificioAdmin('${idEdificio}')`);
    
    // Efecto visual hover sencillo (puedes complementarlo en tu CSS si querés)
    fila.onmouseover = () => fila.style.backgroundColor = "#27272a";
    fila.onmouseout = () => fila.style.backgroundColor = "transparent";

    // Inyección limpia: Solo la Dirección. Al hacer click en cualquier lado de la fila abre el detalle.
    fila.innerHTML = `
      <td style="font-weight: 600; color: #ffffff; padding: 14px 12px; border-bottom: 1px solid #27272a;">
        ${e.address || "Sin Dirección"}
        ${e.name ? `<br><small style="color:#a1a1aa; font-weight:normal; display:inline-block; margin-top:2px;">${e.name}</small>` : ''}
      </td>
    `;
    tablaCuerpo.appendChild(fila);
  });

  actualizarControlesPaginacion(datosAIterar.length);
}

/**
 * 6.2 CONTROLES DE FLUJO DE PAGINACIÓN ADMIN
 * Actualiza dinámicamente las etiquetas de estado y procesa el desplazamiento incremental de la grilla.
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
  const totalElementos = window.todosLosEdificiosDB ? window.todosLosEdificiosDB.length : 0;
  const totalPaginas = Math.ceil(totalElementos / ELEMENTOS_POR_PAGINA) || 1;
  
  if (direccion === -1 && paginaActual > 1) {
    paginaActual--;
  } else if (direccion === 1 && paginaActual < totalPaginas) {
    paginaActual++;
  }
  cargarEdificios();
}

/**
 * 6.3 INTERRUPTOR GENERAL DE MODALES DE AUDITORÍA E HISTORIAL de VISITAS
 * Controla el despliegue del modal de visitas, limpia sus tarjetas y cierra el panel lateral analítico.
 */
async function abrirHistorialEdificio(idEdificioOpcional = null) {
  const idEdificio = idEdificioOpcional || (typeof currentBuildingId !== 'undefined' ? currentBuildingId : null);
  const contenedorHistorial = document.getElementById("historialContenido");
  const modal = document.getElementById("modalHistorial");
  
  if (!idEdificio) {
    alert("Primero selecciona un edificio de la lista.");
    return;
  }
  
  if (modal) modal.style.display = "flex";
  if (contenedorHistorial) {
    contenedorHistorial.innerHTML = `<p style="color:#71717a; text-align:center; padding:20px; font-size:13px;">Buscando registros...</p>`;
  }
  
  try {
    const res = await apiFetch(`/building-info/${idEdificio}`);
    if (!res.ok) throw new Error("No se pudo obtener el historial");
    
    const resData = await res.json();
    const visitas = resData.history || resData.visits || resData.visitas || (resData.lastVisit ? [resData.lastVisit] : []); 
    
    if (visitas.length === 0) {
      if (contenedorHistorial) {
        contenedorHistorial.innerHTML = `
          <div style="text-align:center; padding:30px; color:#71717a;">
            <p style="font-size:24px; margin-bottom:5px;">📂</p>
            <p style="font-size:13px; margin:0;">Este edificio todavía no tiene visitas registradas.</p>
          </div>`;
      }
      return;
    }

    visitas.sort((a, b) => new Date(b.date || b.fecha || b.createdAt) - new Date(a.date || a.fecha || a.createdAt));
    if (contenedorHistorial) contenedorHistorial.innerHTML = "";
    
    visitas.forEach(vis => {
      const fechaRaw = vis.date || vis.fecha || vis.createdAt;
      const fechaFormateada = fechaRaw ? new Date(fechaRaw).toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit'
      }) : "Fecha desconocida";
      
      const depto = vis.department || vis.depto || vis.departamento || "-";
      const estado = vis.status || vis.resultado || "REGISTRADO";
      const nota = vis.notes || vis.nota || "";
      const tieneProblema = vis.hasIssue || vis.issue || vis.problema;
      
      let badgeColor = "#71717a"; 
      let badgeText = estado;
      
      if (estado === "ATENDIO" || estado === "ATENDIÓ") {
        badgeColor = "#16a34a"; 
        badgeText = "✔ ATENDIÓ";
      } else if (estado === "NO_EN_CASA" || estado === "NO EN CASA") {
        badgeColor = "#ca8a04"; 
        badgeText = "✕ NO EN CASA";
      }
      
      const tarjetaVisita = `
        <div style="background: #2c2c2e; border: 1px solid #3a3a3c; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: bold; color: #f4f4f5; font-size: 14px;">🚪 Depto / Unidad: <span style="color:#3b82f6;">${depto}</span></span>
            <span style="font-size: 11px; color: #a1a1aa;">📅 ${fechaFormateada}</span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px;">
            <span style="background: ${badgeColor}; color: white; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${badgeText}</span>
            ${tieneProblema ? `<span style="background: #ef4444; color: white; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: bold;">⚠️ PROBLEMA</span>` : ''}
            ${vis.user || vis.usuario ? `<span style="font-size: 11px; color: #71717a;">Por: ${vis.user || vis.usuario}</span>` : ''}
          </div>
          ${nota ? `
          <div style="background: #1c1c1e; border-left: 3px solid #3b82f6; padding: 6px 10px; border-radius: 4px; margin-top: 4px;">
            <p style="margin: 0; font-size: 12px; color: #d4d4d8; font-style: italic;">" ${nota} "</p>
          </div>
          ` : ''}
        </div>
      `;
      if (contenedorHistorial) contenedorHistorial.insertAdjacentHTML("beforeend", tarjetaVisita);
    });
  } catch (error) {
    console.error("Error cargando historial:", error);
    if (contenedorHistorial) {
      contenedorHistorial.innerHTML = `<p style="color:#ef4444; text-align:center; padding:20px; font-size:13px;">Error al conectar con el servidor para traer el historial.</p>`;
    }
  }
}

function cerrarHistorial() {
  const modal = document.getElementById("modalHistorial");
  if (modal) modal.style.display = "none";
}

function cerrarDetalleAdmin() {
  const panel = document.getElementById("panelDetalleEdificio") || document.getElementById("panelDetalleAdmin");
  if (panel) panel.style.display = "none";
  
  if (window.miniMapaAdminInstance) {
    try {
      window.miniMapaAdminInstance.off();
      window.miniMapaAdminInstance.remove();
    } catch (e) { console.warn("Error apagando miniMapaAdminInstance:", e); }
    window.miniMapaAdminInstance = null;
  }
}

/**
 * 6.4 CONSOLA DE VALIDACIÓN SUPERADMIN
 * Procesa la llave maestra estructural de seguridad y conmuta la vista hacia el entorno analítico.
 */
function verificarAccesoSuperAdmin() {
  const claveInput = document.getElementById("superAdminKey")?.value.trim();

  if (claveInput === "2414") {
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

function abrirAccesoSuperAdmin() {
  const clave = prompt("🔑 Ingrese la clave maestra de SuperAdmin:");
  if (clave) {
    if (clave === "2414") {
      window.superAdminAutenticado = true;
      alert("🔓 Acceso de SuperAdmin Autorizado. Abriendo panel avanzado...");
      abrirVista("superAdminView");
      window.superAdminPaginaActual = 1;
      ejecutarFiltroSuperAdmin();
    } else {
      alert("❌ Clave maestra incorrecta. Intento denegado.");
    }
  }
}

/**
 * 6.5 FILTRADO E INTERFACES DE CONTROL DEL SUPERADMIN
 * Filtra cruzadamente las incidencias críticas reportadas desde el campo de trabajo y renderiza la grilla analítica destructiva.
 */
function ejecutarFiltroSuperAdmin() {
  if (!window.superAdminAutenticado) return;

  const selectorFiltro = document.getElementById("superAdminFiltroEstado")?.value || "TODOS";
  const origenDatos = window.todosLosEdificiosDB || [];
  
  window.superAdminFiltrados = origenDatos.filter(e => {
    const estado = (e.status || e.estado || "Pendiente").toUpperCase();
    
    if (selectorFiltro === "TODOS") return true;
    if (selectorFiltro === "PROBLEMA") return (estado === "PROBLEMA" || estado === "INCIDENCIA" || !!e.problema || !!e.issue);
    return estado === selectorFiltro;
  });

  renderizarTablaSuperAdmin();
}

function renderizarTablaSuperAdmin() {
  const tabla = document.getElementById("tablaSuperAdminCuerpo");
  if (!tabla) return;

  tabla.innerHTML = "";
  const datosSuper = window.superAdminFiltrados || [];

  if (datosSuper.length === 0) {
    tabla.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#a1a1aa; padding:20px;">📭 Ningún registro cumple el criterio del filtro seleccionado.</td></tr>`;
    actualizarPaginacionSuperAdmin(0);
    return;
  }

  const inicio = (window.superAdminPaginaActual - 1) * ELEMENTOS_POR_PAGINA;
  const fin = inicio + ELEMENTOS_POR_PAGINA;
  const segmento = datosSuper.slice(inicio, fin);

  segmento.forEach(e => {
    const id = e.id || e._id;
    const fila = document.createElement("tr");
    const detalleProblema = e.notes || e.problema || (e.issue ? e.issue.description : 'Sin incidencias activas');
    
    fila.innerHTML = `
      <td style="color:#ffffff; font-weight:500;">${e.address || 'Sin Dirección'}</td>
      <td style="color:#e4e4e7;">${e.territory || e.territorio || '-'}</td>
      <td style="color:#fcd34d; font-size:12px; max-width:200px; overflow:hidden; text-overflow:ellipsis;">${detalleProblema}</td>
      <td style="color:#cbd5e1; font-weight:bold; font-size:12px;">${(e.status || e.estado || 'Pendiente').toUpperCase()}</td>
      <td style="text-align:center;">
        <button class="btn-super-history" onclick="verHistorialLogs('${id}')" title="Ver Historial de Logs">📜</button>
        <button class="btn-super-delete" onclick="eliminarEdificioDestructivo('${id}')" title="Eliminar Registro permanentemente">🗑️</button>
      </td>
    `;
    tabla.appendChild(fila);
  });

  actualizarPaginacionSuperAdmin(datosSuper.length);
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
  const datosSuper = window.superAdminFiltrados || [];
  const totalPaginas = Math.ceil(datosSuper.length / ELEMENTOS_POR_PAGINA) || 1;
  if (dir === -1 && window.superAdminPaginaActual > 1) window.superAdminPaginaActual--;
  if (dir === 1 && window.superAdminPaginaActual < totalPaginas) window.superAdminPaginaActual++;
  renderizarTablaSuperAdmin();
}

/**
 * 6.6 ACCIONES CRÍTICAS EN CASCADA Y HISTÓRICOS DE LOGS
 * Ejecuta la eliminación física irreversible en el backend y parsea las trazas de auditoría profunda.
 */
async function eliminarEdificioDestructivo(id) {
  const confirmacion = confirm("⚠️ ADVERTENCIA CRÍTICA ⚠️\n\n¿Está absolutamente seguro de eliminar permanentemente este edificio? Esta acción borrará de forma irreversible el historial de visitas, coordenadas y reportes asociados.");
  if (!confirmacion) return;

  try {
    const res = await apiFetch(`/admin/buildings/${id}`, { method: "DELETE" });
    if (res.ok) {
      alert("🗑️ El registro ha sido eliminado físicamente de la base de datos.");
      if (typeof preCargarBaseDatosEnMemoria === 'function') await preCargarBaseDatosEnMemoria();
      ejecutarFiltroSuperAdmin();
      if (typeof cargarEdificios === "function") cargarEdificios();
    } else {
      alert("❌ Error: El servidor denegó la solicitud de borrado.");
    }
  } catch (err) {
    console.error("Error crítico en cascada de borrado:", err);
    alert("⚠️ Falló la comunicación destructiva con el backend.");
  }
}

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

/**
 * 6.7 VISUALIZADOR DE DETALLES, ALERTAS HISTORIAL Y MINI-MAPA INDEPENDIENTE (ADMIN)
 * Consume la información extendida desde el backend y despliega el panel técnico.
 */
async function verDetalleEdificioAdmin(buildingId) {
  // Guardamos el ID en la variable global para que la app sepa qué edificio está en pantalla
  currentBuildingId = buildingId; 

  const panel = document.getElementById("panelDetalleEdificio");
  if (!panel) {
    console.warn("⚠️ No se encontró el contenedor 'panelDetalleEdificio' en el HTML.");
    return;
  }
  
  panel.style.display = "block";
  panel.innerHTML = `<p style="text-align:center; color:gray; padding:20px;">Cargando historial y detalles...</p>`;

  try {
    const res = await apiFetch(`/building-info/${buildingId}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    
    const data = await res.json();
    const b = data.building;
    if (!b) throw new Error("No se recibieron datos válidos del edificio.");

    // ✨ CALCULO DE EDIFICIO NUEVO EN PANEL ADMIN
    let cartelNuevoAdminHtml = "";
    if (b.createdAt || b.fechaCreacion) {
      const fechaCreacion = new Date(b.createdAt || b.fechaCreacion);
      const hoy = new Date();
      const diferenciaDias = Math.floor((hoy - fechaCreacion) / (1000 * 60 * 60 * 24));
      
      if (diferenciaDias <= 30) {
        const fechaFormateada = fechaCreacion.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        cartelNuevoAdminHtml = `
          <div style="background:#064e3b; border: 1px solid #059669; color:#a7f3d0; padding:10px; border-radius:12px; margin-bottom:12px; font-size:14px; font-weight:600;">
            ✨ Edificio nuevo: ingresado al sistema el ${fechaFormateada}
          </div>
        `;
      }
    }

    let alertaHtml = "";
    if (data.issue) {
      alertaHtml = `
        <div style="background:#3a1f1f; border: 1px solid #f44336; color:#ff8a80; padding:12px; border-radius:12px; margin-bottom:15px; font-size:15px;">
          ⚠️ <b>Problema Reportado (${data.issue.type}):</b> ${data.issue.description || "Sin descripción adicional"}
        </div>
      `;
    }

    // Renderizamos la estructura base aplicando el diseño compatible con ID como string simple
    panel.innerHTML = `
      ${cartelNuevoAdminHtml}
      ${alertaHtml}
      
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px; gap: 10px;">
        <div>
          <h3 style="margin:0; color:white; font-size:22px;">${b.address || "Sin Dirección"}</h3>
          <p style="color:gray; margin:2px 0;">${b.address2 || ""}</p>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button class="secondary" style="width:auto; min-height:38px; padding:6px 12px; font-size:13px; border-radius:8px; white-space:nowrap; background:#1e293b; color:#3b82f6; border-color:#1e3a8a;" onclick="abrirHistorialEdificio()">📜 Historial</button>
          <button class="secondary" style="width:auto; min-height:38px; padding:6px 12px; font-size:13px; border-radius:8px; white-space:nowrap;" onclick="abrirEditorEdificio('${b._id || b.id}')">✏️ Editar</button>
        </div>
      </div>

      <div style="display: flex; gap: 14px; align-items: stretch; margin-bottom: 15px;">
        
        <div style="flex: 1; display: grid; grid-template-columns: 1fr; gap: 6px; font-size: 13px; background:#252525; padding:12px; border-radius:12px; color: #e4e4e7;">
          <div>🏢 <b>Nombre:</b> ${b.name || "-"}</div>
          <div>🗺️ <b>Territorio:</b> ${b.territory || b.territorio || "-"}</div>
          <div>🔢 <b>Pisos:</b> ${b.floors || 0}</div>
          <div>🚪 <b>Deptos/Piso:</b> ${b.unitsPerFloor || 0}</div>
          <div>🌱 <b>PB:</b> ${b.hasGroundFloor ? "Sí" : "No"} | 🛎️ <b>Portero:</b> ${b.hasDoorman ? "Sí" : "No"}</div>
        </div>

        <div id="contenedorMapaAdminSquare" style="width: 140px; height: 140px; flex-shrink: 0; position: relative;">
          <div id="miniMapaDetalle" style="width: 140px; height: 140px; border-radius: 12px; border: 1px solid #3f3f46; background:#181818;"></div>
        </div>

      </div>

      <h4 style="margin:10px 0 5px; color:#2196F3; font-size:16px;">🕒 Historial de Visitas e Información</h4>
      <div style="font-size:14px; background:#181818; padding:10px; border-radius:10px; max-height:180px; overflow-y:auto; border:1px solid #2b2b2b;">
        <p style="margin:0; color:#bdbdbd;">Última visita registrada: ${data.lastVisit ? new Date(data.lastVisit.date).toLocaleDateString('es-AR') : "Nunca"}</p>
        ${b.description ? `<p style="margin-top:8px; color:gray; font-style: italic;"><b>Descripción interna:</b> ${b.description}</p>` : ""}
      </div>
    `;

    // Manejo seguro del temporizador global
    if (typeof miTemporizadorMapa !== 'undefined' && miTemporizadorMapa) {
      clearTimeout(miTemporizadorMapa);
    }

    miTemporizadorMapa = setTimeout(() => {
      const miMapaReal = (typeof mapaGeneral !== 'undefined' && mapaGeneral !== null) ? mapaGeneral : 
                         (typeof leafletMap !== 'undefined' && leafletMap !== null) ? leafletMap : 
                         (typeof map !== 'undefined' && map !== null) ? map : null;

      if (miMapaReal) {
        try { miMapaReal.invalidateSize({ animate: false }); } catch(e){}

        const latValida = parseFloat(b.latitude);
        const lngValida = parseFloat(b.longitude);
        const tieneCoordenadas = !isNaN(latValida) && !isNaN(lngValida) && isFinite(latValida) && latValida !== 0;

        // 📍 SI TIENE COORDENADAS: Renderizamos el mapa estático cuadrado
        if (tieneCoordenadas) {
          console.log(`📍 Inicializando mini-mapa estático para: ${latValida}, ${lngValida}`);
          try { miMapaReal.setView([latValida, lngValida], 16); } catch(e){}

          if (typeof miniMapaAdminInstance !== 'undefined' && miniMapaAdminInstance !== null) {
            try {
              miniMapaAdminInstance.remove();
            } catch (e) { console.warn("Error limpiando mapa anterior:", e); }
            miniMapaAdminInstance = null;
          }

          setTimeout(() => {
            try {
              miniMapaAdminInstance = L.map('miniMapaDetalle', {
                center: [latValida, lngValida],
                zoom: 16,
                zoomControl: false,
                attributionControl: false,
                dragging: false,
                touchZoom: false,
                doubleClickZoom: false,
                scrollWheelZoom: false,
                boxZoom: false,
                keyboard: false
              });

              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(miniMapaAdminInstance);
              L.marker([latValida, lngValida]).addTo(miniMapaAdminInstance);
              miniMapaAdminInstance.invalidateSize();
              console.log("🟢 Mini-mapa estático cuadrado renderizado con éxito.");
            } catch (miniMapError) {
              console.error("Error creando el mini-mapa independiente:", miniMapError);
            }
          }, 50);

        // 🗺️ SI NO TIENE COORDENADAS PERO SÍ TERRITORIO: Encuadra en el polígono
        } else if ((b.territory || b.territorio) && typeof misTerritoriosGeoJSON !== 'undefined' && misTerritoriosGeoJSON !== null) {
          try {
            const numTerritorio = b.territory || b.territorio;
            let capaGeoJSONAdmin = L.geoJSON(misTerritoriosGeoJSON, {
              filter: function(feature) {
                const numeroTerritorio = feature.properties && (feature.properties.name || feature.properties.Territorio_N);
                return String(numeroTerritorio) === String(numTerritorio);
              }
            });

            if (capaGeoJSONAdmin.getLayers().length > 0) {
              console.log(`🗺️ Encuadrando mapa general en el Territorio ${numTerritorio}`);
              miMapaReal.fitBounds(capaGeoJSONAdmin.getBounds(), { padding: [25, 25], maxZoom: 16 });
            }
          } catch (geoError) {
            console.warn("Fallo al encuadrar territorio:", geoError);
          }
          
          const minMapDiv = document.getElementById("miniMapaDetalle");
          if (minMapDiv) minMapDiv.innerHTML = `<p style="color:#71717a; font-size:11px; text-align:center; padding-top:55px; margin:0;">Falta geolocalización</p>`;

        } else {
          // Coordenadas fallback por defecto de Posadas
          try { miMapaReal.setView([-27.36708, -55.89608], 15); } catch(e){}
        }
          
      } else {
        console.warn("⚠️ No se encontró la instancia activa del mapa general.");
      }
    }, 100);

  } catch (error) {
    console.error("Error al cargar detalles del edificio:", error);
    panel.innerHTML = `<p style="color:#f87171; text-align:center; padding: 20px;">⚠️ Error al conectar con los detalles del edificio.</p>`;
  }
}
// =========================================================================
// 🗺️ SECCIÓN 7: MOTOR CARTOGRÁFICO MAESTRO CENTRAL (ADMIN APP)
// =========================================================================

/** * 7.1 INICIALIZACIÓN DE LA ARQUITECTURA DEL MAPA MAESTRO GENERAL
 * Levanta la instancia principal enfocada en Posadas usando el set global directo
 * de polígonos e inicializa el detector de zooms profundos para las capas visuales. */

function inicializarMapaGeneralAdministrador() {
  const mapaDiv = document.getElementById("mapaGeneralAdmin") || document.getElementById("map");
  if (!mapaDiv || mapaGeneral) return;

  try {
    mapaGeneral = L.map(mapaDiv.id, {
      zoomControl: true,
      attributionControl: false
    }).setView([-27.36708, -55.89608], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(mapaGeneral);

    // Renderizado inmediato y directo de los polígonos estables de territorios.js
    if (typeof misTerritoriosGeoJSON !== 'undefined' && misTerritoriosGeoJSON !== null) {
      L.geoJSON(misTerritoriosGeoJSON, {
        style: function(feature) {
          const idTerritorio = parseInt(feature.properties?.name || feature.properties?.Territorio_N || 0);
          const paletaPastel = ["#473f57", "#394a51", "#3d4a3e", "#54483b", "#513939", "#4b3947", "#393b51"];
          const colorAsignado = paletaPastel[idTerritorio % paletaPastel.length];

          return {
            fillColor: colorAsignado,
            weight: 2,
            opacity: 0.9,
            color: "#52525b",
            fillOpacity: 0.35
          };
        },
        onEachFeature: function(feature, layer) {
          const nombreZona = feature.properties?.name || feature.properties?.Territorio_N || "S/D";
          
          layer.bindTooltip(String(nombreZona), {
            permanent: true,
            direction: 'center',
            className: 'texto-territorio-elegante'
          });

          layer.on('mouseover', function () { this.setStyle({ fillOpacity: 0.60 }); });
          layer.on('mouseout', function () { this.setStyle({ fillOpacity: 0.35 }); });

          layer.on('click', function(e) {
            const comboFiltro = document.getElementById("busquedaTerritorio");
            if (comboFiltro) {
              comboFiltro.value = nombreZona;
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
      
      console.log("🗺️ Capa vectorial de polígonos inyectada con éxito en Mapa Maestro.");
    }

    // Detector dinámico para optimizar las etiquetas de texto según profundidad de zoom
    mapaGeneral.on('zoomend', function() {
      const zoomActual = mapaGeneral.getZoom();
      const etiquetas = document.querySelectorAll('.texto-territorio-elegante');
      
      etiquetas.forEach(tag => {
        if (zoomActual >= 14) {
          tag.classList.add('vista-cerca');
          tag.classList.remove('zoom-alejado');
        } else {
          tag.classList.remove('vista-cerca');
          tag.classList.add('zoom-alejado');
        }
      });
    });

  } catch (err) {
    console.error("❌ Fallo crítico al levantar la arquitectura Leaflet principal:", err);
  }
}
/**
 * 7.2 INTERCONEXIÓN DE FILTROS ADMINISTRATIVOS
 * Procesa en tiempo real las búsquedas por dirección o territorio cruzando los
 * datos contra la caché global para actualizar la grilla operativa de forma inmediata.
 */
function ejecutarFiltrosAdmin() {
  const filtroDir = document.getElementById("busquedaDireccionAdmin")?.value.toLowerCase().trim() || "";
  const filtroTerr = document.getElementById("busquedaTerritorio")?.value.toLowerCase().trim() || "";

  // Filtramos la base de datos completa basándonos en los inputs activos
  window.todosLosEdificiosDB = window.baseDatosEdificiosMemoria.filter(e => {
    const cumpleDir = !filtroDir || (e.address && e.address.toLowerCase().includes(filtroDir));
    const cumpleTerr = !filtroTerr || (e.territory && String(e.territory).toLowerCase().includes(filtroTerr)) || (e.territorio && String(e.territorio).toLowerCase().includes(filtroTerr));
    return cumpleDir && cumpleTerr;
  });

  // Reseteamos a la página 1 para evitar desbordamientos de índice y redibujamos
  paginaActual = 1;
  cargarEdificios();
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

/**
 * REPARACIÓN DEFINITIVA: CONTROLADOR DE PESTAÑAS DE BÚSQUEDA (Dirección / Territorio)
 * Sincroniza las clases 'active' y alterna la visibilidad de los contenedores compactos.
 */
function cambiarTabFiltro(tabTipo) {
  const btnDireccion = document.getElementById("btnTabDireccion");
  const btnTerritorio = document.getElementById("btnTabTerritorio");
  
  const contenedorDireccion = document.getElementById("buscarDireccionContainer");
  const contenedorTerritorio = document.getElementById("buscarTerritorioContainer");

  if (tabTipo === 'direccion') {
    btnDireccion?.classList.add('active');
    btnTerritorio?.classList.remove('active');
    if (contenedorDireccion) contenedorDireccion.style.display = "block";
    if (contenedorTerritorio) contenedorTerritorio.style.display = "none";
    console.log("🔍 Modo de búsqueda establecido en: Dirección");
  } else {
    btnTerritorio?.classList.add('active');
    btnDireccion?.classList.remove('active');
    if (contenedorDireccion) contenedorDireccion.style.display = "none";
    if (contenedorTerritorio) contenedorTerritorio.style.display = "block";
    console.log("🔍 Modo de búsqueda establecido en: Territorio");
  }
}


