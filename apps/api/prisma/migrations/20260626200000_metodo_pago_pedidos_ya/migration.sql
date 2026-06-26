-- Agrega PEDIDOS_YA como método de pago. Los pedidos cobrados vía PedidosYa no
-- ingresan al efectivo de la caja (el dinero lo liquida la plataforma), por eso
-- el nuevo valor no toca el cálculo de "esperado efectivo" del cierre.
ALTER TYPE "MetodoPago" ADD VALUE 'PEDIDOS_YA';
