-- Agrega TRANSFERENCIA como método de pago. El dinero de una transferencia
-- bancaria no ingresa al efectivo físico de la caja (se acredita en cuenta),
-- por eso el nuevo valor no toca el cálculo de "esperado efectivo" del cierre
-- (calcularTotales sólo suma EFECTIVO). Se reporta a SIFEN con iTiPago = 5.
ALTER TYPE "MetodoPago" ADD VALUE 'TRANSFERENCIA';
