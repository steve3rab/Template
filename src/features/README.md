# Features

Place each business domain in its own folder, for example `src/features/<domain>/`.
A feature should own its UI, domain types, services and tests. Cross-feature reuse belongs in
`src/shared`; avoid imports from one feature's internal files into another feature.
