INSERT INTO `months` (`userId`, `label`)
SELECT 1, '2026-05'
WHERE NOT EXISTS (
  SELECT 1 FROM `months` WHERE `userId` = 1 AND `label` = '2026-05'
);
--> statement-breakpoint
SET @may_2026_month_id := (SELECT `id` FROM `months` WHERE `userId` = 1 AND `label` = '2026-05' LIMIT 1);
--> statement-breakpoint
DELETE FROM `expense_items` WHERE `cardId` IN (SELECT `id` FROM `expense_cards` WHERE `monthId` = @may_2026_month_id);
--> statement-breakpoint
DELETE FROM `expense_cards` WHERE `monthId` = @may_2026_month_id;
--> statement-breakpoint
DELETE FROM `income_entries` WHERE `monthId` = @may_2026_month_id;
--> statement-breakpoint
DELETE FROM `bank_balances` WHERE `monthId` = @may_2026_month_id;
--> statement-breakpoint
INSERT INTO `bank_balances` (`monthId`, `accountName`, `balance`, `sortOrder`) VALUES
(@may_2026_month_id, 'Conta Pessoal — Pedro', '0.00', 0),
(@may_2026_month_id, 'Conta Pessoal — Débora', '0.00', 1),
(@may_2026_month_id, 'Conta Empresa — Inter', '0.00', 2),
(@may_2026_month_id, 'Conta Empresa — C6', '0.00', 3);
--> statement-breakpoint
INSERT INTO `expense_cards` (`monthId`, `name`, `icon`, `sortOrder`) VALUES
(@may_2026_month_id, 'Casa', '🏠', 0),
(@may_2026_month_id, 'Cuidados Pessoais', '✨', 1),
(@may_2026_month_id, 'Cartões Pedro', '💳', 2),
(@may_2026_month_id, 'Cartões Débora', '💳', 3),
(@may_2026_month_id, 'Escritório', '🏢', 4);
--> statement-breakpoint
SET @card_casa := (SELECT `id` FROM `expense_cards` WHERE `monthId` = @may_2026_month_id AND `name` = 'Casa' LIMIT 1);
--> statement-breakpoint
SET @card_cuidados := (SELECT `id` FROM `expense_cards` WHERE `monthId` = @may_2026_month_id AND `name` = 'Cuidados Pessoais' LIMIT 1);
--> statement-breakpoint
SET @card_pedro := (SELECT `id` FROM `expense_cards` WHERE `monthId` = @may_2026_month_id AND `name` = 'Cartões Pedro' LIMIT 1);
--> statement-breakpoint
SET @card_debora := (SELECT `id` FROM `expense_cards` WHERE `monthId` = @may_2026_month_id AND `name` = 'Cartões Débora' LIMIT 1);
--> statement-breakpoint
SET @card_escritorio := (SELECT `id` FROM `expense_cards` WHERE `monthId` = @may_2026_month_id AND `name` = 'Escritório' LIMIT 1);
--> statement-breakpoint
INSERT INTO `expense_items` (`cardId`, `name`, `dueDate`, `value`, `paidValue`, `status`, `sortOrder`) VALUES
(@card_casa, 'Aluguel', '', '700.00', '0.00', 'pendente', 0),
(@card_casa, 'Internet', '15/05', '100.00', '0.00', 'pendente', 1),
(@card_casa, 'Energia (+/-)', '', '270.00', '0.00', 'pendente', 2),
(@card_casa, 'Feira', '', '1500.00', '0.00', 'pendente', 3),
(@card_casa, 'Carro', '', '4646.48', '0.00', 'pendente', 4),
(@card_casa, 'Combustível', '', '1000.00', '0.00', 'pendente', 5),
(@card_casa, 'Faxina (0/2)', '', '300.00', '0.00', 'pendente', 6),
(@card_casa, 'Parcela da casa', '', '1100.00', '0.00', 'pendente', 7),
(@card_casa, 'Condomínio', '', '222.70', '176.70', 'parcial', 8),
(@card_casa, 'Dízimo', '', '2500.00', '52.00', 'parcial', 9),
(@card_casa, 'Programação fim de ano', '', '80.00', '0.00', 'pendente', 10),
(@card_casa, 'Raquel', '', '46.70', '0.00', 'pendente', 11),
(@card_casa, 'Caneca', '', '30.00', '0.00', 'pendente', 12),
(@card_casa, 'Parcela celular de Mainha', '', '72.00', '0.00', 'pendente', 13),
(@card_cuidados, 'Pedro - Cabelo (1/4)', '', '140.00', '35.00', 'parcial', 0),
(@card_cuidados, 'Débora - Cabelo', '', '120.00', '0.00', 'pendente', 1),
(@card_pedro, 'Nu', '23/05', '1858.97', '0.00', 'pendente', 0),
(@card_pedro, 'Inter', '', '591.48', '0.00', 'pendente', 1),
(@card_pedro, 'Pic', '', '3133.47', '0.00', 'pendente', 2),
(@card_pedro, 'Sam''s', '23/05', '95.89', '0.00', 'pendente', 3),
(@card_pedro, 'Itaú', 'PAGO', '900.05', '900.05', 'pago', 4),
(@card_pedro, 'C6', '', '127.26', '0.00', 'pendente', 5),
(@card_pedro, 'Sofisa', '', '524.80', '0.00', 'pendente', 6),
(@card_pedro, 'XP', '', '103.89', '0.00', 'pendente', 7),
(@card_debora, 'Caixa', '20/05', '1291.41', '0.00', 'pendente', 0),
(@card_debora, 'Inter', '20/05', '926.57', '0.00', 'pendente', 1),
(@card_debora, 'PicPay (inclui IPTU de R$ 518,00)', '20/05', '1269.16', '0.00', 'pendente', 2),
(@card_debora, 'Sofisa', '25/05', '165.08', '0.00', 'pendente', 3),
(@card_debora, 'Itaú', '05/05 - PAGO', '938.28', '938.28', 'pago', 4),
(@card_escritorio, 'Aluguel', '12/05', '3000.00', '0.00', 'pendente', 0),
(@card_escritorio, 'Escritório virtual', '17/05', '80.00', '0.00', 'pendente', 1),
(@card_escritorio, 'Contabilidade', '10/04 - PAGO', '760.00', '760.00', 'pago', 2),
(@card_escritorio, 'Internet', '15/04', '979.99', '0.00', 'pendente', 3),
(@card_escritorio, 'Energia', '18/05', '368.58', '0.00', 'pendente', 4),
(@card_escritorio, 'Água (pedir água 2/8)', '', '88.00', '0.00', 'pendente', 5),
(@card_escritorio, 'Mercado Pago', 'PAGO', '1588.50', '1588.50', 'pago', 6),
(@card_escritorio, 'Empréstimo Mercado Livre', '18/05', '500.00', '0.00', 'pendente', 7),
(@card_escritorio, 'Seguro', '08/05 - PAGO', '324.67', '324.67', 'pago', 8),
(@card_escritorio, 'Simples Nacional', '', '2000.00', '0.00', 'pendente', 9),
(@card_escritorio, 'IPTU (01 de 08)', 'PAGO', '194.01', '194.01', 'pago', 10),
(@card_escritorio, 'Cartões pessoais', '', '636.86', '0.00', 'pendente', 11),
(@card_escritorio, 'MAC STUDIO (3/8)', '', '1500.00', '0.00', 'pendente', 12),
(@card_escritorio, 'Pessoal - SY (R$ 4.150,00 - R$ 350,00)', '', '3800.00', '0.00', 'pendente', 13),
(@card_escritorio, 'Pessoal - Rai', '', '2150.00', '0.00', 'pendente', 14),
(@card_escritorio, 'Distribuição de lucro - Pedro (pago R$ 580,00)', '', '12500.00', '0.00', 'pendente', 15),
(@card_escritorio, 'Distribuição de lucro - Débora', '', '12500.00', '0.00', 'pendente', 16),
(@card_escritorio, 'Manutenção', '', '200.00', '0.00', 'pendente', 17);
--> statement-breakpoint
INSERT INTO `income_entries` (`monthId`, `name`, `value`, `received`, `sortOrder`) VALUES
(@may_2026_month_id, 'Politani', '11177.86', 0, 0),
(@may_2026_month_id, 'Guilherme', '1000.00', 0, 1),
(@may_2026_month_id, 'Jimmy', '3685.42', 0, 2),
(@may_2026_month_id, 'Vitor', '0.00', 0, 3),
(@may_2026_month_id, 'Jeremy (+ Conexpo + US$ 500)', '8845.02', 0, 4),
(@may_2026_month_id, 'Ulysses + Expenses', '2675.00', 0, 5);
