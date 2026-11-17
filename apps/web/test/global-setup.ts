// Le harnais de la base de test est celui de `donnees` : un seul Postgres jetable, migré, dont
// l'URL arrive aux tests par `inject("testDatabaseUrl")`.
export { default } from "donnees/test/global-setup";
