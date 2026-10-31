-- Seed the existing demo storefront so its cart can be converted into persistent orders.
INSERT INTO "Product" ("id", "sellerId", "name", "description", "category", "priceCents", "stock", "imageUrl", "active", "createdAt", "updatedAt")
VALUES
('1', NULL, 'Veste Studio', 'Une coupe structurée, facile à porter du matin au soir.', 'Vêtements', 8900, 100, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('2', NULL, 'Sneakers Everyday', 'Le confort au quotidien, avec une silhouette minimaliste.', 'Chaussures', 7400, 100, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('3', NULL, 'Sac Épure', 'Un sac compact et pratique pour garder l’essentiel à portée de main.', 'Accessoires', 5900, 100, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('4', NULL, 'Pull Essentiel', 'Une maille douce et une coupe décontractée.', 'Vêtements', 6500, 100, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('5', NULL, 'Lunettes Soleil', 'Une touche graphique pour les journées ensoleillées.', 'Accessoires', 3500, 100, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('6', NULL, 'Baskets City', 'Des lignes sobres qui s’accordent avec toutes vos tenues.', 'Chaussures', 9200, 100, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('7', NULL, 'Chemise Relax', 'Une chemise légère pensée pour les superpositions.', 'Vêtements', 4800, 100, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('8', NULL, 'Casquette Club', 'La finition simple qui change un look.', 'Accessoires', 2500, 100, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
