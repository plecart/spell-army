// Le thème du site, clair ou sombre (direction artistique § 1, « Thèmes ») : celui du système
// (`prefers-color-scheme`, lu par la CSS) tant que le bouton n'en a pas choisi un, gardé alors dans
// le navigateur.

/** La clé du thème choisi dans le `localStorage` du navigateur, qui vaut « light » ou « dark ». */
export const THEME_KEY = "theme";

/**
 * Le script qui pose le thème choisi sur `<html>` (`data-theme`) avant le premier rendu : en ligne
 * dans le `<head>`, il s'exécute pendant l'analyse du HTML (Next.js 16.4, guide « How to prevent
 * flash before hydration », « Themes »). Un stockage illisible ou une valeur inconnue laissent le
 * thème du système.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
