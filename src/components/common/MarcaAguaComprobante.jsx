import { LEYENDA_SIN_RED } from '../../services/historialOfflineService'

/**
 * Marca de agua del comprobante impreso sin conexión (Task 2,
 * specs/offline-suite.md RF-03). Se dibuja detrás del contenido del ticket con
 * `position:absolute` + rotación, y la leyenda "PENDIENTE DE SINCRONIZACIÓN
 * FISCAL" se repite en texto legible debajo porque la marca de agua puede
 * quedar cubierta por una impresora de ticket angosta.
 *
 * El padre debe ser `position-relative` (el ticket `.comprobante-ticket` lo es
 * en impresión, donde el CSS de `style.scss` lo fija a la hoja).
 */
const MarcaAguaComprobante = ({ texto = LEYENDA_SIN_RED }) => (
  <>
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '90%',
        transform: 'translate(-50%, -50%) rotate(-20deg)',
        color: 'rgba(220, 53, 69, 0.28)',
        fontSize: '0.62rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        lineHeight: 1.15,
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {texto}
    </span>
    <div className="text-center mt-3 mb-2 px-1">
      <div
        className="text-danger fw-bold text-uppercase"
        style={{ fontSize: '0.68rem', letterSpacing: '0.02em', lineHeight: 1.25 }}
      >
        {texto}
      </div>
      <div className="text-danger-emphasis text-uppercase" style={{ fontSize: '0.58rem' }}>
        Comprobante no fiscal
      </div>
    </div>
  </>
)

export default MarcaAguaComprobante
