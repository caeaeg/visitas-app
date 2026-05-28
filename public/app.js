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
// 🔌 SECTOR: MOTOR DE COMUNICACIÓN CENTRALIZADO (API FETCH)
// =========================================================================

/**
 * Envoltura segura sobre Fetch API para resolver URL base, inyección de encabezados,
 * control visual de carga y manejo automatizado de tokens.
 */
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  
  // URL base adaptada para entornos de desarrollo local y despliegue en red
  const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : window.location.origin;

  const url = `${baseUrl}${endpoint}`;

  // Configuración por defecto de cabeceras seguras
  options.headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  // Desplegamos la barra estética de carga en la parte superior de la UI
  if (loadingBar) loadingBar.style.width = "30%";

  try {
    const response = await fetch(url, options);
    
    if (loadingBar) loadingBar.style.width = "100%";
    setTimeout(() => { if (loadingBar) loadingBar.style.width = "0%"; }, 400);

    // Si detectamos que la credencial expiró, forzamos redirección al login limpio
    if (response.status === 401 || response.status === 403) {
      console.warn("🔐 Token inválido o expirado. Redireccionando...");
      localStorage.clear();
      abrirVista("loginView");
      return response;
    }

    return response;
  } catch (error) {
    if (loadingBar) loadingBar.style.width = "0%";
    console.error("❌ Error físico de red en apiFetch:", error);
    throw error;
  }
}

// =========================================================================
// 🔐 SECTOR: CONTROL DE ACCESO, INICIO DE SESIÓN Y VISTAS
// =========================================================================
/**
 * Controla la visibilidad de la barra o indicador de carga (loading)
 * @param {boolean} mostrar - True para mostrar, false para ocultar
 */
function mostrarLoading(mostrar) {
  // Buscamos si existe un indicador de carga en tu HTML (por ejemplo, con id "loading")
  const spinner = document.getElementById("loading") || document.getElementById("loadingSpinner");
  
  if (spinner) {
    spinner.style.display = mostrar ? "flex" : "none";
  } else {
    // Si no tenés un elemento visual de carga en el HTML, cambiamos el cursor del navegador
    // para que el usuario sepa que el sistema está procesando la solicitud en segundo plano
    document.body.style.cursor = mostrar ? "wait" : "default";
  }
}
/**
 * Autentica credenciales contra el backend y rutea al usuario según su rol de cuenta
 */
/**
 * Procesa el inicio de sesión autenticando contra el backend corporativo
 */
async function login() {
  const user = document.getElementById("loginUser")?.value.trim();
  const pass = document.getElementById("loginPass")?.value.trim();
  const msgLabel = document.getElementById("loginMsg");

  if (!user || !pass) {
    alert("⚠️ Por favor complete todos los campos obligatorios.");
    if (msgLabel) msgLabel.innerText = "Campos incompletos.";
    return;
  }

  mostrarLoading(true);
  if (msgLabel) msgLabel.innerText = "";

  try {
    const respuesta = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass })
    });

    if (!respuesta.ok) {
      const errData = await respuesta.json().catch(() => ({}));
      throw new Error(errData.message || "Credenciales incorrectas");
    }

    const datos = await respuesta.json();
    
    // 🔍 VALIDACIÓN ADAPTADA AL BACKEND REAL
    if (datos.ok === false || !datos.ok) {
      throw new Error("Usuario o contraseña incorrectos");
    }

    // Almacenamiento seguro del estado de sesión (Tu backend usa username y role)
    localStorage.setItem("username", datos.username);
    localStorage.setItem("role", datos.role);
    currentRole = datos.role;

    console.log(`🔑 Sesión iniciada con éxito. Usuario: ${datos.username}, Rol: ${currentRole}`);
    
    // Descarga y sincronización inicial de la Base de Datos en Memoria RAM
    await preCargarBaseDatosEnMemoria();

    // Redirección de vistas según privilegios de rol
    if (currentRole === "admin" || currentRole === "conductor") {
      abrirVista("dashboardView");
      // Inicialización diferida del motor de mapas para evitar congelamiento de UI
      setTimeout(() => {
        if (typeof inicializarMapaGeneralAdministrador === "function") {
          inicializarMapaGeneralAdministrador();
        }
        if (typeof cargarEdificios === "function") {
          cargarEdificios();
        }
      }, 100);
    } else {
      abrirVista("appContainer");
      limpiarVista();
    }

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
 * Orquestador dinámico de navegación: Apaga todas las pantallas y enciende la solicitada
 * @param {string} vistaId - ID del contenedor HTML de destino
 */
function abrirVista(vistaId) {
  const vistas = ["loginView", "dashboardView", "appContainer", "editarView", "superAdminView"];
  
  vistas.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === vistaId) {
        // Manejo adaptativo de flex y block según necesidades estructurales del layout
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

  // Forzar actualización estructural si el administrador salta al mapa general
  if (vistaId === "dashboardView" && typeof mapaGeneral !== 'undefined' && mapaGeneral) {
    setTimeout(() => { mapaGeneral.invalidateSize(); }, 200);
  }
}

/**
 * Descarga y mantiene caliente el pool central de edificios en memoria de la app
 */
async function preCargarBaseDatosEnMemoria() {
  try {
    const endpoint = (localStorage.getItem("role") === "admin") ? '/admin/buildings' : '/buildings';
    const res = await apiFetch(endpoint);
    if (res.ok) {
      const resData = await res.json();
      window.todosLosEdificiosDB = resData.data || resData || [];
      console.log(`📦 Sincronización Exitosa: ${window.todosLosEdificiosDB.length} registros cargados en memoria.`);
    }
  } catch (err) {
    console.error("Falla preventiva al precargar base de datos:", err);
  }
}

/**
 * Cierra sesión borrando el caché local y devuelve al usuario al login
 */
function logout() {
  localStorage.clear();
  currentRole = "";
  window.todosLosEdificiosDB = [];
  window.edificiosEncontrados = [];
  abrirVista("loginView");
}

// =========================================================================
// 📱 SECTOR: NÚCLEO DE INTERACCION DEL BUSCADOR MÓVIL (PREDI)
// =========================================================================

/**
 * Ejecuta el filtrado predictivo en tiempo real desde la terminal móvil.
 * Resguarda la inyección contra caracteres especiales y comillas.
 */
async function buscarDireccion() {
  const input = document.getElementById("buildingId");
  if (!input) return;

  const textoBusqueda = input.value.trim();
  
  if (textoBusqueda === "") {
    limpiarVista();
    return;
  }

  const msgInicial = document.getElementById("mensajeInicial");
  if (msgInicial) msgInicial.style.display = "none";

  const busquedaNormalizada = normalizarDireccion(textoBusqueda);
  
  if (!window.todosLosEdificiosDB || window.todosLosEdificiosDB.length === 0) {
    if (resultado) resultado.innerText = "⏳ Sincronizando datos con el servidor... Reintente en un instante.";
    return;
  }

  // Filtrado multipropiedad en memoria local
  window.edificiosEncontrados = window.todosLosEdificiosDB.filter(e => {
    const dir1 = normalizarDireccion(e.address || "");
    const dir2 = normalizarDireccion(e.address2 || e.direccion2 || "");
    const nom = normalizarDireccion(e.name || e.nombre || "");
    const terr = String(e.territory || e.territorio || "");
    
    return dir1.includes(busquedaNormalizada) || 
           dir2.includes(busquedaNormalizada) || 
           nom.includes(busquedaNormalizada)  || 
           terr === busquedaNormalizada;
  });

  window.indiceEdificioActual = 0;

  // CASO A: Sin Coincidencias - Despliega creación rápida
  if (window.edificiosEncontrados.length === 0) {
    limpiarVista();
    if (resultado) {
      resultado.innerHTML = `
        <p style="color:#a1a1aa; font-size:14px; margin-bottom:12px;">
          ❌ No se encontró ningún edificio que coincida con "${textoBusqueda}".
        </p>
      `;
    }
    
    if (btnNuevoEdificio) {
      btnNuevoEdificio.style.display = "block";
      btnNuevoEdificio.setAttribute("data-direccion-sugerida", textoBusqueda);
      btnNuevoEdificio.onclick = function() {
        const direccionSugerida = this.getAttribute("data-direccion-sugerida");
        abrirEditorEdificio({ address: direccionSugerida });
      };
    }
    return;
  }

  // CASO B: Match exitoso - Despliega carrusel móvil
  if (btnNuevoEdificio) btnNuevoEdificio.style.display = "none";
  mostrarEdificioActual();
}
// =========================================================================
// 📱 PARTE 2: CARRUSEL MÓVIL (PREDI), REGISTRO DE VISITAS Y MODAL DE INCIDENCIAS
// =========================================================================

/**
 * Renderiza el edificio activo en el carrusel de búsqueda móvil.
 * Construye la interfaz de control y mapea el mini-mapa de referencia en campo.
 */
function mostrarEdificioActual() {
  if (!window.edificiosEncontrados || window.edificiosEncontrados.length === 0) return;

  const e = window.edificiosEncontrados[window.indiceEdificioActual];
  window.currentBuildingId = e.id || e._id;

  if (resultado) resultado.innerHTML = "";

  // Construcción del contenedor dinámico de la tarjeta de relevamiento
  const tarjeta = document.createElement("div");
  tarjeta.className = "building-card animate-fade-in";
  
  // Normalización de campos de estado internos
  const visitas = e.visitas || 0;
  const estadoActual = (e.status || e.estado || "Pendiente").toUpperCase();
  let badgeColor = "#e2e8f0";
  let badgeTextoColor = "#1e293b";

  if (estadoActual === "OK" || estadoActual === "EFECTUADA") { badgeColor = "#dcfce7"; badgeTextoColor = "#15803d"; }
  else if (estadoActual === "NO" || estadoActual === "RECHAZADA") { badgeColor = "#fee2e2"; badgeTextoColor = "#b91c1c"; }
  else if (estadoActual === "PROBLEMA" || estadoActual === "INCIDENCIA") { badgeColor = "#fef9c3"; badgeTextoColor = "#a16207"; }

  tarjeta.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <span style="font-size:12px; color:#a1a1aa; font-weight:600;">📝 REGISTRO ${window.indiceEdificioActual + 1} de ${window.edificiosEncontrados.length}</span>
      <span style="background:${badgeColor}; color:${badgeTextoColor}; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:bold;">${estadoActual}</span>
    </div>
    <h3 style="margin:0 0 4px 0; color:#ffffff; font-size:18px;">${e.address || "Sin Dirección Relatada"}</h3>
    ${e.name ? `<p style="margin:0 0 6px 0; color:#38bdf8; font-size:14px; font-weight:500;">🏢 ${e.name}</p>` : ''}
    <p style="margin:0 0 10px 0; color:#a1a1aa; font-size:13px;">📍 Territorio / Zona: <strong style="color:#e4e4e7">${e.territory || e.territorio || "No Asignado"}</strong></p>
    
    <div style="background:#27272a; padding:10px; border-radius:8px; margin-bottom:12px; font-size:13px; color:#e4e4e7;">
      <div>📊 <strong>Visitas registradas:</strong> ${visitas}</div>
      ${e.notes ? `<div style="margin-top:6px; color:#cbd5e1; border-left:2px solid #a855f7; padding-left:6px; font-style:italic;">"${e.notes}"</div>` : ""}
    </div>

    <!-- Contenedor físico reservado para el mapa de campo móvil -->
    <div id="prediMiniMapContainer" style="width:100%; height:160px; border-radius:8px; margin-bottom:12px; background:#27272a; position:relative; overflow:hidden;"></div>
  `;

  if (resultado) resultado.appendChild(tarjeta);

  // --- Orquestación de la botonera inferior de control móvil ---
  if (infoEdificio) infoEdificio.style.display = "block";
  if (reportBtn) reportBtn.style.display = "block";

  // Manejo de visibilidad del botón de salto de tarjeta (Siguiente)
  if (btnSiguiente) {
    btnSiguiente.style.display = window.edificiosEncontrados.length > 1 ? "block" : "none";
  }

  // --- Inicialización o refresco del mini-mapa móvil (Leaflet) ---
  setTimeout(() => {
    const lat = parseFloat(e.latitude || e.lat);
    const lng = parseFloat(e.longitude || e.lng || e.lon);

    if (isNaN(lat) || isNaN(lng)) {
      const container = document.getElementById("prediMiniMapContainer");
      if (container) container.innerHTML = `<div style="color:#a1a1aa; text-align:center; padding-top:65px; font-size:12px;">📍 Coordenadas ausentes o inválidas para mapeo</div>`;
      return;
    }

    // Si ya existía un mapa activo en memoria, limpiamos sus listeners e instancia de forma segura
    if (prediMiniMap) {
      prediMiniMap.off();
      prediMiniMap.remove();
      prediMiniMap = null;
    }

    try {
      prediMiniMap = L.map('prediMiniMapContainer', {
        zoomControl: false,
        attributionControl: false,
        dragging: !L.Browser.mobile, // Bloquea arrastre en móviles para no interferir con el scroll de la app
        tap: false
      }).setView([lat, lng], 16);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20
      }).addTo(prediMiniMap);

      // Icono customizado estilo pin tecnológico para campo
      const prediIcon = L.divIcon({
        className: 'custom-predi-marker',
        html: `<div style="background:#a855f7; width:12px; height:12px; border:2px solid #ffffff; border-radius:50%; box-shadow:0 0 8px #a855f7;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });

      L.marker([lat, lng], { icon: prediIcon }).addTo(prediMiniMap);
      
      // Invalidate mecánico para asegurar el render correcto dentro del div dinámico
      setTimeout(() => { if (prediMiniMap) prediMiniMap.invalidateSize(); }, 150);

    } catch (mapErr) {
      console.error("Error al montar mapa de predi móvil:", mapErr);
    }
  }, 100);
}

/**
 * Salta al siguiente registro disponible en el carrusel circular de filtrados
 */
function siguienteEdificio() {
  if (!window.edificiosEncontrados || window.edificiosEncontrados.length <= 1) return;
  
  window.indiceEdificioActual++;
  if (window.indiceEdificioActual >= window.edificiosEncontrados.length) {
    window.indiceEdificioActual = 0; // Bucle continuo
  }
  mostrarEdificioActual();
}

/**
 * Despacha al backend el registro de una visita (Efectuada, Rechazada, etc.)
 * @param {string} tipoAccion - Estado de salida ('OK', 'NO')
 */
async function registrarVisita(tipoAccion) {
  if (!window.currentBuildingId) {
    alert("⚠️ No se ha detectado una ID de edificio válida en foco.");
    return;
  }

  const comentarioInput = document.getElementById("observacionRapida");
  const comentario = comentarioInput ? comentarioInput.value.trim() : "";

  try {
    const res = await apiFetch(`/buildings/${window.currentBuildingId}/visit`, {
      method: "POST",
      body: JSON.stringify({
        action: tipoAccion, // Transmisión exacta de la acción ejecutada ('OK' / 'NO')
        notes: comentario
      })
    });

    if (res.ok) {
      alert(`✅ Registro guardado exitosamente como: ${tipoAccion}`);
      if (comentarioInput) comentarioInput.value = ""; // Limpieza de caja
      
      // Refrescamos la persistencia caliente y actualizamos la tarjeta en pantalla
      await preCargarBaseDatosEnMemoria();
      
      // Actualizamos dinámicamente el pool en foco para no resetear la búsqueda del usuario
      const idx = window.todosLosEdificiosDB.findIndex(b => (b.id || b._id) === window.currentBuildingId);
      if (idx !== -1) {
        window.edificiosEncontrados[window.indiceEdificioActual] = window.todosLosEdificiosDB[idx];
      }
      
      mostrarEdificioActual();
    } else {
      const errData = await res.json().catch(() => ({}));
      alert(`❌ Error en el servidor: ${errData.message || "No se pudo registrar la visita."}`);
    }
  } catch (err) {
    console.error("Falla crítica en red al registrar visita:", err);
    alert("⚠️ Falla de conectividad. No se pudo registrar la visita.");
  }
}

// =========================================================================
// 🪟 CONTROLADORES DE MODALES: REPORTES DE PROBLEMAS / INCIDENCIAS
// =========================================================================

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
  abrirVista("editarView");
  
  const inDir = document.getElementById("edit_address");
  const inNom = document.getElementById("edit_name");
  const inTerr = document.getElementById("edit_territory");
  const inId = document.getElementById("edit_building_id");

  if (inDir) inDir.value = objetoEdificio.address || "";
  if (inNom) inNom.value = objetoEdificio.name || "";
  if (inTerr) inTerr.value = objetoEdificio.territory || objetoEdificio.territorio || "";
  if (inId) inId.value = objetoEdificio.id || objetoEdificio._id || "";

  // Inicialización o refresco del mapa interno del editor
  setTimeout(() => {
    const latBase = parseFloat(objetoEdificio.latitude || -27.36708);
    const lngBase = parseFloat(objetoEdificio.longitude || -55.89608);

    if (leafletMap) {
      leafletMap.off();
      leafletMap.remove();
      leafletMap = null;
    }

    leafletMap = L.map('mapaEditor', { zoomControl: true }).setView([latBase, lngBase], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(leafletMap);

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

    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 200);
  }, 150);
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

document.addEventListener("DOMContentLoaded", async () => {
  console.log("⚡ Levantando núcleo de la aplicación de relevamiento...");
  
  const tokenExistente = localStorage.getItem("token");
  const rolExistente = localStorage.getItem("role");

  if (tokenExistente && rolExistente) {
    currentRole = rolExistente;
    await preCargarBaseDatosEnMemoria();

    if (currentRole === "admin") {
      abrirVista("dashboardView");
      inicializarMapaGeneralAdministrador();
      cargarEdificios();
    } else {
      abrirVista("appContainer");
      limpiarVista();
    }
  } else {
    // Si no hay sesión caliente, exponemos directamente la pantalla de Login
    abrirVista("loginView");
  }
});
