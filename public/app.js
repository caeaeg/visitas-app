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

/**
 * 3. REFERENCIAS Y NÚCLEO GEOGRÁFICO (LEAFLET)
 * Instancias de control para el despliegue, marcadores y agrupamientos de mapas.
 */
let leafletMap = null;       // Instancia transaccional utilizada en el formulario de edición
let leafletMarker = null;    // Marcador arrastrable (Draggable) del formulario de edición
let map = null;              // Instancia del mapa principal del panel administrativo
let prediMiniMap = null;     // Instancia del mapa opcional adaptado a la visualización móvil
let markerClusterGroup = null; // Contenedor lógico para el empaquetado de marcadores masivos

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

// Controladores avanzados de sincronización visual
window.miTemporizadorMapa = null;      // Manejador del delay de redimensionamiento (InvalidateSize)
window.miniMapaAdminInstance = null;   // Instancia aislada para previsualizaciones secundarias

// Estados específicos asignados al subsistema SuperAdmin
window.superAdminAutenticado = false;
window.superAdminPaginaActual = 1;
window.superAdminFiltrados = [];
const ELEMENTOS_POR_PAGINA = 10;

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
  // Recuperamos credenciales reales asegurando compatibilidad global
  const username = localStorage.getItem('username') || localStorage.getItem('user');
  const role = localStorage.getItem('role');
  
  // Mantenemos vivas las variables de control global exigidas por el núcleo original
  if (username) currentUser = username;
  if (role) currentRole = role;
  
  // URL base unificada para entornos locales y despliegue definitivo
  const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://visitas-app-inxa.onrender.com';

  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  // Configuración base de cabeceras seguras
  options.headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  // Inyección estricta en cabeceras para validación del middleware 'requireLogin'
  if (username && role) {
    options.headers['x-user'] = username;
    options.headers['x-role'] = role;
  }

  if (typeof loadingBar !== 'undefined' && loadingBar) loadingBar.style.width = "30%";

  try {
    const response = await fetch(url, options);
    
    if (typeof loadingBar !== 'undefined' && loadingBar) loadingBar.style.width = "100%";
    setTimeout(() => { 
      if (typeof loadingBar !== 'undefined' && loadingBar) loadingBar.style.width = "0%"; 
    }, 400);

    // Si las credenciales caducaron o no posee permisos, deslogueamos forzadamente
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
 * 2. ESTRUCTURADOR DE CABECERAS
 * Genera de forma estandarizada los diccionarios de autenticación para llamadas externas manuales.
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
 * Manipula la visibilidad del indicador de carga global o altera el cursor del DOM.
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
 * Recoge datos de interfaz, valida campos mínimos y autentica la sesión contra el servidor.
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

    // Almacenamiento unificado cruzado para blindar compatibilidad histórica
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
 * 5. ORQUESTADOR DE ENTORNO SEGÚN PERMISOS
 * Modula la UI al loguearse: restringe descargas masivas para evitar errores 403 al rol predi.
 */
async function iniciarAppConPermisos() {
  const elLogin = document.getElementById("loginScreen");
  if (elLogin) elLogin.style.display = "none";
  
  if (typeof aplicarPermisos === "function") aplicarPermisos();

  const appContainer = document.getElementById("appContainer");
  const mainDashboard = document.getElementById("mainDashboard");

  if (currentRole === "predi") {
    // Interfaz móvil estricta para relevamiento en campo
    if (mainDashboard) mainDashboard.style.display = "none";
    if (appContainer) appContainer.style.setProperty("display", "block", "important");
    
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    
    // Regla operativa: Trabajo bajo demanda en tiempo real. No precarga datos masivos.
    window.baseDatosEdificiosMemoria = [];
    console.log("⚡ Entorno Predi configurado. Buscador directo en tiempo real activo.");
    
    if (typeof limpiarVista === "function") limpiarVista();
  } else {
    // Panel administrativo centralizado
    if (mainDashboard) mainDashboard.style.display = "block";
    if (appContainer) appContainer.style.display = "none";
    
    await descargarBaseAdministrativa();
    abrirVista("dashboardView");
  }
}

/**
 * 6. RECOLECTOR MASIVO DE DATOS ADMINISTRATIVOS
 * Descarga y almacena en memoria caché los registros globales del sistema para visualización de paneles.
 */
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

/**
 * 7. ENRUTADOR DINÁMICO DE PANTALLAS
 * Controla visualmente las transiciones ocultando y mostrando selectores de ID específicos.
 */
function abrirVista(vistaId) {
  // Control de privacidad: Impide el acceso manual de predi a interfaces administrativas
  if (currentRole === "predi" && vistaId !== "editarView" && vistaId !== "appContainer") {
    if (document.getElementById("mainDashboard")) document.getElementById("mainDashboard").style.display = "none";
    if (document.getElementById("appContainer")) document.getElementById("appContainer").style.setProperty("display", "block", "important");
    return;
  }

  const vistas = ["loginScreen", "loginView", "dashboardView", "appContainer", "editarView", "superAdminView"];
  
  vistas.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === vistaId) {
        if (id === "appContainer") {
          el.style.setProperty("display", "block", "important");
        } else if (id === "dashboardView") {
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

  // Excepción visual específica para cuando el predi opera el formulario de edición
  if (vistaId === "editarView" && currentRole === "predi") {
    if (document.getElementById("appContainer")) document.getElementById("appContainer").style.display = "none";
    if (document.getElementById("mainDashboard")) document.getElementById("mainDashboard").style.display = "block";
  }

  if (vistaId === "dashboardView" && typeof mapaGeneral !== 'undefined' && mapaGeneral) {
    setTimeout(() => { mapaGeneral.invalidateSize(); }, 200);
  }
}

/**
 * 8. CIERRE DE SESIÓN
 * Borra las credenciales activas del almacenamiento, limpia buffers volátiles y reescribe UI al login.
 */
function logout() {
  localStorage.clear();
  currentUser = "";
  currentRole = "";
  window.todosLosEdificiosDB = [];
  window.baseDatosEdificiosMemoria = [];
  window.edificiosEncontrados = [];
  abrirVista("loginScreen");
}

/**
 * 9. RECEPTOR DE CARGA DEL DOCUMENTO Y ESCANEO QR
 * Restaura sesiones e intercepta parámetros de búsqueda por query string (?building=) al inicializar.
 */
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
  
  // Enlaces QR directos
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
 * Analiza el estado del LocalStorage en el milisegundo cero de carga para mitigar parpadeos de interfaz.
 */
(function iniciarValidacionInmediata() {
  console.log("🔄 Inicializando núcleo de la aplicación de relevamiento...");

  const ejecutarControl = () => {
    const usuarioGuardado = localStorage.getItem("username");
    const rolGuardado = localStorage.getItem("role");

    // Bloque A: Sin credenciales. Reset preventivo e imposición de login
    if (!usuarioGuardado || !rolGuardado) {
      console.log("ℹ️ Sin credenciales en memoria. Desplegando formulario de acceso.");
      localStorage.clear();

      const loginScreen = document.getElementById("loginScreen");
      if (loginScreen) {
        loginScreen.style.display = "block";
        loginScreen.classList.add("active");
      }

      ["dashboardView", "appContainer", "editarView", "superAdminView"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = "none";
          el.classList.remove("active");
        }
      });
      return;
    }

    // Bloque B: Sesión existente recuperada. Ruteo según rol
    currentRole = rolGuardado;
    currentUser = usuarioGuardado;
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
 * Prepara e inyecta la pantalla de edición ocultando de raíz la interfaz del predi.
 */
function abrirEditorEdificio(objetoEdificio = null) {
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

  // Modificación estética: Solo la flecha limpia de retroceso
  document.getElementById("editarView").innerHTML = `
    <div style="padding: 10px 15px; text-align: left;">
      <button onclick="${funcionCancelar}" style="background: none; border: none; color: #a1a1aa; font-size: 26px; cursor: pointer; padding: 5px 10px;">←</button>
    </div>
    ${htmlContenido}
  `;

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
// 🪟 CONTROLADORES DE MODALES: REPORTES DE PROBLEMAS / INCIDENCIAS
// =========================================================================

/** * 1. ALIAS ENRUTADOR DE ACCESO * Resuelve el quiebre de ejecución mapeando el clic inline del HTML ('abrirReporte') * hacia el despliegue del modal de incidencias críticas. */

function abrirReporte() {
  console.log("📋 Interceptando llamada de interfaz. Abriendo pasarela de incidencias...");
  abrirModalProblema();
}

/** * 2. DISPARADOR DE INCIDENCIAS INTEGRADO (PROMPT NATIVO) * Lanza un cuadro emergente del navegador para registrar reportes rápidos en app.post("/issues")*/

async function abrirModalIncidencia() {
  if (!window.currentBuildingId) {
    alert("⚠️ Error: No hay un edificio activo seleccionado para reportar.");
    return;
  }
  
  const detalle = prompt("⚠️ Escriba el reporte o problema detectado en el edificio:");
  if (!detalle || detalle.trim() === "") return;

  const deptoId = window.departamentoEnFoco ? window.departamentoEnFoco._id : null;

  try {
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

/** * 3. APERTURA DEL MODAL PERSONALIZADO * Despliega el contenedor flotante de incidencias críticas en pantalla y le da foco. */

function abrirModalProblema() {
  if (!window.currentBuildingId) {
    alert("⚠️ Error: Debe seleccionar o buscar un edificio antes de reportar un problema.");
    return;
  }

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

/** * 4. CIERRE DEL MODAL PERSONALIZADO * Oculta la interfaz flotante y limpia los efectos visuales de animación. */

function cerrarModalProblema() {
  const modal = document.getElementById("modalProblema");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("animate-fade-in");
  }
}

/**
 * 5. DESPACHADOR CENTRAL DE REPORTES CRÍTICOS
 * Transmite la incidencia al servidor, refresca la caché en segundo plano y actualiza el carrusel.
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
      if (typeof preCargarBaseDatosEnMemoria === "function") {
        await preCargarBaseDatosEnMemoria();
      }
      
      if (window.todosLosEdificiosDB && window.todosLosEdificiosDB.length > 0) {
        const idx = window.todosLosEdificiosDB.findIndex(b => (b.id || b._id) === window.currentBuildingId);
        if (idx !== -1 && window.edificiosEncontrados[window.indiceEdificioActual]) {
          window.edificiosEncontrados[window.indiceEdificioActual] = window.todosLosEdificiosDB[idx];
        }
      }
      
      if (typeof mostrarEdificioActual === "function") {
        mostrarEdificioActual();
      }
    } else {
      alert("❌ El servidor rechazó el envío del reporte.");
    }
  } catch (err) {
    console.error("Error físico al enviar reporte de incidencia:", err);
    alert("⚠️ Error de red. Compruebe su conexión a internet.");
  }
}

/** * 6. LIMPIEZA TOTAL DE INTERFAZ MÓVIL * Resetea por completo los paneles predictivos del visor usando el objeto seguro UI. */

function limpiarVista() {
  if (UI.resultado) UI.resultado.innerHTML = "";
  if (UI.infoEdificio) UI.infoEdificio.style.display = "none";
  if (UI.reportBtn) UI.reportBtn.style.display = "none";
  if (UI.btnNuevoEdificio) UI.btnNuevoEdificio.style.display = "none";
  
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
  console.log("🧼 Interfaz del visor móvil restablecida de forma segura.");
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




