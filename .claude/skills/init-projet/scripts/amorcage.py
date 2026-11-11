"""Amorçage : les gestes de dépôt locaux d'`init-projet`, faits par script, chacun relu.

Usage :
    python amorcage.py depot init
    python amorcage.py copie <boilerplate>
    python amorcage.py valide <fichier> --schema {vendor.github-workflows,vendor.dependabot}
    python amorcage.py ignore --exclus <chemin> … --suivis <chemin> …
    python amorcage.py mcp <nom> <url>
    python amorcage.py commit

Les étapes 2, 7, 8, 10 et 12 d'`init-projet`, dans le dossier du projet, qui est le répertoire
courant. Chaque sous-commande qui écrit fait son geste puis le relit ; `valide` et `ignore`
vérifient seulement. Les sorties des commandes se lisent en octets, décodés en UTF-8.

- `depot init` : hors d'un dépôt git, `git init -b main`, puis la relecture veut un dépôt dont la
  branche courante (`git symbolic-ref --short HEAD`) est `main`. Dans un dépôt sur `main`, rien à
  faire ; sur une autre branche, refus, la branche nommée : rien ne se renomme en silence ;
- `copie` : copie `<boilerplate>/template/` à la racine du projet, hors `template/.github/` — ses
  deux modèles à trous se génèrent à l'étape 7, jamais tels quels —, et `<boilerplate>/skills/`
  sous `.claude/skills/`, un dossier par skill. Tout ou rien : une cible qui existe sous un autre
  contenu est un conflit, et le refus les nomme tous sans rien copier — la fusion d'un
  `settings.json` déjà là reste à la main ; une cible identique se saute. La relecture veut chaque
  fichier copié identique, octet pour octet, à sa source. Un `<boilerplate>` sans `template/` ou
  sans `skills/` est refusé ;
- `valide` : `uvx check-jsonschema --builtin-schema <schéma> <copie>` — `pipx run
  check-jsonschema …` si `uvx` ne se lance pas —, sur une copie de `<fichier>` dans un dossier
  temporaire, sous son nom, extension remplacée par `.yml` : sans elle, l'outil lit du JSON
  (mesuré le 2026-10-26, check-jsonschema 0.38.2). Le dossier temporaire est retiré dans tous les
  cas. Invalide, le refus porte les cinq premières lignes non vides de la sortie de l'outil ;
- `ignore` : chaque chemin `--exclus` doit être ignoré par git, chaque `--suivis` ne pas l'être,
  par `git check-ignore --no-index -q`, un appel par chemin ; le refus nomme chaque chemin en
  défaut. Sans `--no-index`, un fichier suivi n'est jamais dit ignoré : un `uv.lock` suivi
  masquerait le motif `*.lock` qui l'exclut d'un clone neuf (git-check-ignore(1), « --no-index » ;
  mesuré le 2026-10-26, git 2.47.1). Un dossier absent n'est reconnu comme dossier que par sa
  barre finale, `node_modules/`, ou par un chemin qu'il contient ;
- `mcp` : si `claude mcp list` liste un serveur `<nom>` — une ligne `<nom>: …` —, rien à faire ;
  sinon `claude mcp add --scope user --transport http <nom> <url>`, puis la relecture veut `<nom>`
  dans `claude mcp list` ;
- `commit` : refuse tant que `git ls-files -i -c --exclude-standard` liste un fichier suivi que les
  règles d'ignore excluent — un `.gitignore` n'agit pas sur ce qui est déjà suivi —, et les nomme
  tous ; sans rien à commiter, rien à faire ; sinon `git add -A` et `git commit -m "chore:
  amorçage pipeline de dev"`. La relecture veut ce titre pour sujet du dernier commit, et un
  `git status --porcelain` vide. Ces deux lectures neutralisent les quatre clés de configuration
  git recensées qui en changeaient la conclusion (`STATUS`, `SUBJECT`) ; d'un dépôt imbriqué,
  seul compte son pointeur, que `git add -A` commite, jamais son contenu interne.

**Ce qu'il ne prouve pas.** `depot init` lit le dépôt qui contient le répertoire courant, sans
vérifier qu'il en est la racine ; une `HEAD` détachée y est refusée par l'échec de
`git symbolic-ref`. Lancé dans le `.git` d'un dépôt, il n'y voit pas d'arbre de travail et y
initialise un dépôt imbriqué (mesuré le 2026-10-26, git 2.47.1). `copie` ne lit que les fichiers
du boilerplate : un fichier du projet qu'il n'a pas n'est ni lu ni retiré, et rien n'est verrouillé
entre la comparaison et la copie. `valide` ne prouve que le schéma : un `{{…}}` resté dans une
chaîne, ou un `uses:` sans empreinte, lui est valide (mesuré le 2026-10-26). `ignore` éprouve les
motifs, pas ce qui est déjà suivi : c'est le refus de `commit`. `mcp` ne compare ni l'URL ni la
portée d'un serveur déjà listé, et ne dit pas qu'il répond. Un hook qui refuse le commit laisse
l'index tel que `git add -A` l'a fait : relecture non conforme. Une erreur du système de fichiers
— `<fichier>` ou une source absents, une cible non inscriptible — sort en trace Python, code 1
(mesuré le 2026-10-26 sur un `<fichier>` absent). Sous Windows, le `claude` qu'installe npm est
un `claude.cmd`, que `cmd.exe` lance en relisant ses arguments sans échappement (CPython,
`Doc/library/subprocess.rst`, « Security Considerations ») : une URL qui porte `&`, `|` ou `%` y
est interprétée (mesuré le 2026-10-26 sur un `.cmd` témoin).

Sortie : 0 fait et relu, rien à faire, ou conforme ; 1 refus (« refus — »), rien n'étant écrit, ou
geste lancé et relecture non conforme ou impossible (« relecture non conforme — ») — motif en une
ligne sur la sortie standard ; 2 appel mal formé, usage sur la sortie d'erreur. Python 3.11 ou plus,
bibliothèque standard seule ; `git`, et selon la sous-commande `uvx` ou `pipx`, ou `claude`.
"""

import argparse
import io
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Callable, Generator, Sequence
from contextlib import contextmanager
from pathlib import Path

Run = Callable[[Sequence[str]], subprocess.CompletedProcess[bytes]]

TRUNK = "main"
# Les schémas d'`init-projet` : son `ci.yml` et son `dependabot.yml` (étape 7).
SCHEMAS = ("vendor.github-workflows", "vendor.dependabot")
# Les lanceurs de `check-jsonschema`, dans l'ordre d'essai : `pipx` sans `uv`.
LAUNCHERS = (("uvx",), ("pipx", "run"))
# Ce que le refus de `valide` garde de la sortie de l'outil.
REPORTED_LINES = 5
# Le code de `git check-ignore` sur un chemin non ignoré (git-check-ignore(1), « EXIT STATUS »).
NOT_IGNORED = 1
BOOTSTRAP_TITLE = "chore: amorçage pipeline de dev"
# Les deux lectures de `commit`, avec les options qui neutralisent les quatre clés de
# configuration git recensées qui en changeaient la conclusion (mesuré le 2026-10-26,
# git 2.47.1) : sans elles, `status.showUntrackedFiles=no` cache les fichiers non suivis et
# `diff.ignoreSubmodules=all` le pointeur avancé d'un dépôt imbriqué ; `i18n.logOutputEncoding`
# réencode le sujet et `log.showSignature` le fait précéder d'une ligne de vérification.
# `--ignore-submodules=dirty` compte ce que `git add -A` peut commiter d'un dépôt imbriqué, son
# pointeur, et tait son contenu interne, qu'il ne peut pas : avec `none`, un fichier non suivi
# dans le dépôt imbriqué lançait un `git commit` sans rien à écrire (mesuré le même jour).
STATUS = ("git", "status", "--porcelain", "--untracked-files=normal", "--ignore-submodules=dirty")
SUBJECT = ("git", "log", "-1", "--format=%s", "--encoding=UTF-8", "--no-show-signature")


class Refusal(Exception):
    """Rien n'est écrit : une condition du geste n'est pas tenue ; le message est le motif."""


class Divergence(Exception):
    """Le geste est lancé, et la relecture ne rend pas l'attendu ou n'a pas pu se faire."""


def default_run(cmd: Sequence[str]) -> subprocess.CompletedProcess[bytes]:
    """Lance `cmd` et capture ses sorties **en octets**, quel que soit son code de sortie.

    Le programme se résout par `shutil.which`, qui lit `PATHEXT` : sous Windows, le `claude` de
    npm est un `claude.cmd` que `CreateProcess` ne trouve pas sous son nom nu (`[WinError 2]`,
    mesuré le 2026-10-26). Introuvable, il part tel quel, et lève `OSError`.
    """
    program = shutil.which(cmd[0]) or cmd[0]
    return subprocess.run([program, *cmd[1:]], capture_output=True, check=False)


def launch(run: Run, cmd: Sequence[str]) -> subprocess.CompletedProcess[bytes]:
    """`cmd` lancé par `run`, quel que soit son code de sortie.

    Raises:
        Refusal: la commande ne se lance pas — exécutable introuvable.
    """
    try:
        return run(cmd)
    except OSError as error:
        raise Refusal(f"`{cmd[0]}` ne se lance pas : {error}") from error


def failed(cmd: Sequence[str], done: subprocess.CompletedProcess[bytes]) -> Refusal:
    """Le refus de `cmd`, sortie en échec : son code, et sa sortie d'erreur en une ligne."""
    motif = " ".join(done.stderr.decode("utf-8", "replace").split())
    return Refusal(f"`{' '.join(cmd)}` a échoué ({done.returncode}) : {motif}")


def output_of(run: Run, cmd: Sequence[str]) -> str:
    """La sortie standard de `cmd`, décodée en UTF-8.

    Raises:
        Refusal: la commande ne se lance pas (`launch`), ou sort en échec (`failed`) — une sortie
            vide d'une commande en échec ne se lit jamais comme une réponse.
    """
    done = launch(run, cmd)
    if done.returncode != 0:
        raise failed(cmd, done)
    return done.stdout.decode("utf-8", "replace")


@contextmanager
def writing() -> Generator[None, None, None]:
    """Le bloc qui lance un geste puis le relit : un refus y devient une divergence.

    Raises:
        Divergence: une commande du bloc échoue ou ne se lance pas — le geste a pu partir, ce
            qu'un refus ferait croire impossible.
    """
    try:
        yield
    except Refusal as error:
        raise Divergence(str(error)) from error


def current_branch(run: Run) -> str:
    """La branche courante du dépôt git ; une `HEAD` détachée ou l'absence de dépôt font échouer
    `git symbolic-ref`, et lèvent `Refusal` (`output_of`)."""
    return output_of(run, ("git", "symbolic-ref", "--short", "HEAD")).strip()


def depot_init(run: Run, _args: argparse.Namespace) -> str:
    """`depot init` : initialise le dépôt git du projet sur `main`, puis relit sa branche.

    Raises:
        Refusal: le projet est déjà un dépôt git, sur une autre branche — nommée.
        Divergence: `git init` échoue, ou la relecture ne trouve pas un dépôt sur `main`.
    """
    # Hors d'un dépôt, `git` sort en 128 sans rien écrire sur sa sortie standard.
    if launch(run, ("git", "rev-parse", "--is-inside-work-tree")).stdout.strip() == b"true":
        if (branch := current_branch(run)) != TRUNK:
            raise Refusal(f"le dépôt est sur la branche {branch}, pas {TRUNK} : rien n'est renommé")
        return f"rien à faire — dépôt git déjà sur {TRUNK}"
    with writing():
        output_of(run, ("git", "init", "-b", TRUNK))
        branch = current_branch(run)
    if branch != TRUNK:
        raise Divergence(f"branche relue {branch}, attendu {TRUNK}")
    return f"initialisé et relu — dépôt git sur {TRUNK}"


def copy_pairs(boilerplate: Path) -> list[tuple[Path, Path]]:
    """Chaque fichier à copier du boilerplate, avec sa cible relative au projet, dans l'ordre de
    leurs chemins POSIX — le même sous Windows, où `Path` se trie sans la casse, que sous Linux.

    Raises:
        Refusal: `boilerplate` n'a pas `template/` ou `skills/` — chacun nommé.
    """
    # Chaque arbre du boilerplate, et où il se copie dans le projet.
    trees = {"template": Path(), "skills": Path(".claude", "skills")}
    if missing := [f"{name}/" for name in trees if not (boilerplate / name).is_dir()]:
        raise Refusal(f"{boilerplate} n'a pas {' ni '.join(missing)}")
    generated = boilerplate / "template" / ".github"
    return [
        (source, target / source.relative_to(boilerplate / name))
        for name, target in trees.items()
        for source in sorted((boilerplate / name).rglob("*"), key=Path.as_posix)
        if source.is_file() and generated not in source.parents
    ]


def same_bytes(source: Path, target: Path) -> bool:
    """`target` est un fichier identique, octet pour octet, à `source`."""
    return target.is_file() and target.read_bytes() == source.read_bytes()


def copy_boilerplate(_run: Run, args: argparse.Namespace) -> str:
    """`copie` : copie le boilerplate dans le projet, tout ou rien, puis relit chaque copie.

    Raises:
        Refusal: un arbre manque au boilerplate (`copy_pairs`), ou des cibles diffèrent de leur
            source — toutes nommées, rien n'est copié.
        Divergence: une copie relue diffère de sa source — chacune nommée.
    """
    pairs = copy_pairs(args.boilerplate)
    pending = [(source, target) for source, target in pairs if not same_bytes(source, target)]
    if conflicts := [target.as_posix() for _, target in pending if target.exists()]:
        raise Refusal(
            f"cibles différentes de leur source ({len(conflicts)}), rien n'est copié :"
            f" {', '.join(conflicts)}"
        )
    if not pending:
        return f"rien à faire — fichiers déjà identiques : {len(pairs)}"
    for source, target in pending:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    differing = [target.as_posix() for source, target in pending if not same_bytes(source, target)]
    if differing:
        raise Divergence(f"copie différente de sa source : {', '.join(differing)}")
    skipped = len(pairs) - len(pending)
    return f"copié et relu — fichiers copiés : {len(pending)}, déjà identiques : {skipped}"


def check_schema(run: Run, check: Sequence[str]) -> subprocess.CompletedProcess[bytes]:
    """`check` lancé par le premier lanceur de `LAUNCHERS` qui se lance, quel que soit son code de
    sortie.

    Raises:
        Refusal: aucun lanceur ne se lance.
    """
    for launcher in LAUNCHERS:
        try:
            return run((*launcher, *check))
        except OSError:
            pass
    raise Refusal(f"ni {' ni '.join(launcher[0] for launcher in LAUNCHERS)} ne se lancent")


def validate(run: Run, args: argparse.Namespace) -> str:
    """`valide` : valide le fichier contre son schéma, sur une copie `.yml` temporaire.

    Raises:
        Refusal: l'outil ne se lance pas (`check_schema`), ou le fichier est invalide — les
            `REPORTED_LINES` premières lignes non vides de la sortie de l'outil, stdout d'abord.
    """
    with tempfile.TemporaryDirectory() as folder:
        copy = Path(folder) / f"{args.file.stem}.yml"
        shutil.copyfile(args.file, copy)
        done = check_schema(run, ("check-jsonschema", "--builtin-schema", args.schema, str(copy)))
    if done.returncode != 0:
        output = b"\n".join((done.stdout, done.stderr)).decode("utf-8", "replace")
        lines = [line.strip() for line in output.splitlines() if line.strip()]
        report = " ; ".join(lines[:REPORTED_LINES])
        raise Refusal(f"{args.file} invalide ({args.schema}) : {report}")
    return f"valide — {args.file} ({args.schema})"


def is_ignored(run: Run, path: str) -> bool:
    """`path` est exclu par les règles d'ignore du dépôt, lues sans l'index (`--no-index`).

    Raises:
        Refusal: `git` ne se lance pas, ou sort autrement qu'en 0 ou 1 — hors d'un dépôt, 128.
    """
    cmd = ("git", "check-ignore", "--no-index", "-q", path)
    done = launch(run, cmd)
    if done.returncode not in (0, NOT_IGNORED):
        raise failed(cmd, done)
    return done.returncode == 0


def check_ignore(run: Run, args: argparse.Namespace) -> str:
    """`ignore` : éprouve les règles d'ignore sur les chemins `--exclus` et `--suivis`.

    Raises:
        Refusal: un chemin en défaut — chacun nommé —, ou `git` en échec (`is_ignored`).
    """
    gaps = [f"devrait être exclu : {path}" for path in args.exclus if not is_ignored(run, path)]
    gaps += [f"devrait rester suivi : {path}" for path in args.suivis if is_ignored(run, path)]
    if gaps:
        raise Refusal(" ; ".join(gaps))
    return f"conforme — exclus : {len(args.exclus)}, suivis : {len(args.suivis)}"


def mcp_listed(run: Run, name: str) -> bool:
    """`claude mcp list` liste un serveur `name` : une ligne `<nom>: <url> (<transport>) - …`
    (mesuré le 2026-10-26, Claude Code 2.1.295) ; `context7-local` n'est pas `context7`.

    Raises:
        Refusal: `claude` ne se lance pas, ou sort en échec (`output_of`).
    """
    listing = output_of(run, ("claude", "mcp", "list"))
    return any(line.startswith(f"{name}: ") for line in listing.splitlines())


def mcp_add(run: Run, args: argparse.Namespace) -> str:
    """`mcp` : ajoute le serveur MCP, en portée utilisateur, s'il n'est pas listé, puis relit la
    liste.

    Raises:
        Refusal: la première lecture de la liste échoue (`mcp_listed`).
        Divergence: l'ajout ou la relecture échouent, ou la liste relue n'a pas le serveur.
    """
    if mcp_listed(run, args.name):
        return f"rien à faire — serveur MCP {args.name} déjà listé"
    add = ("claude", "mcp", "add", "--scope", "user", "--transport", "http", args.name, args.url)
    with writing():
        output_of(run, add)
        listed = mcp_listed(run, args.name)
    if not listed:
        raise Divergence(f"{args.name} absent de `claude mcp list` après son ajout")
    return f"ajouté et relu — serveur MCP {args.name} ({args.url})"


def changes(run: Run) -> list[str]:
    """Les lignes de `git status --porcelain` (`STATUS`) : ce que `git add -A` puis `git commit`
    peuvent encore commiter, fichiers non suivis et pointeurs de dépôts imbriqués compris."""
    return output_of(run, STATUS).splitlines()


def commit_bootstrap(run: Run, _args: argparse.Namespace) -> str:
    """`commit` : commite tout le projet sous le titre d'amorçage, puis relit le commit.

    Raises:
        Refusal: des fichiers suivis sont exclus par les règles d'ignore — tous nommés —, ou une
            lecture de `git` échoue avant le geste.
        Divergence: `git add` ou `git commit` échouent, ou la relecture trouve un autre sujet ou
            un arbre non propre.
    """
    # `-z` : sans lui, un nom accentué sort entre guillemets, octets en octal (`core.quotePath`).
    listing = output_of(run, ("git", "ls-files", "-i", "-c", "--exclude-standard", "-z"))
    if tracked := [name for name in listing.split("\0") if name]:
        raise Refusal(
            "fichiers suivis que les règles d'ignore excluent, à retirer par `git rm --cached` :"
            f" {', '.join(tracked)}"
        )
    if not changes(run):
        return "rien à faire — rien à commiter"
    with writing():
        output_of(run, ("git", "add", "-A"))
        output_of(run, ("git", "commit", "-m", BOOTSTRAP_TITLE))
        subject = output_of(run, SUBJECT).strip()
        left = changes(run)
    gaps: list[str] = []
    if subject != BOOTSTRAP_TITLE:
        gaps.append(f"dernier commit « {subject} », attendu « {BOOTSTRAP_TITLE} »")
    if left:
        gaps.append(f"arbre non propre après le commit : {' ; '.join(left)}")
    if gaps:
        raise Divergence(" ; ".join(gaps))
    return f"commité et relu — {BOOTSTRAP_TITLE}"


def build_parser() -> argparse.ArgumentParser:
    """Les sous-commandes du module ; chacune pose son `handler`."""
    parser = argparse.ArgumentParser(
        prog="amorcage.py",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    commands = parser.add_subparsers(dest="command", required=True)
    depots = commands.add_parser("depot").add_subparsers(dest="action", required=True)
    depots.add_parser("init").set_defaults(handler=depot_init)
    copy = commands.add_parser("copie")
    copy.add_argument("boilerplate", metavar="<boilerplate>", type=Path)
    copy.set_defaults(handler=copy_boilerplate)
    check = commands.add_parser("valide")
    check.add_argument("file", metavar="<fichier>", type=Path)
    check.add_argument("--schema", choices=SCHEMAS, required=True)
    check.set_defaults(handler=validate)
    ignore = commands.add_parser("ignore")
    for option in ("--exclus", "--suivis"):
        ignore.add_argument(option, metavar="<chemin>", nargs="+", required=True)
    ignore.set_defaults(handler=check_ignore)
    server = commands.add_parser("mcp")
    server.add_argument("name", metavar="<nom>")
    server.add_argument("url", metavar="<url>")
    server.set_defaults(handler=mcp_add)
    commands.add_parser("commit").set_defaults(handler=commit_bootstrap)
    return parser


def main(argv: Sequence[str], run: Run = default_run) -> int:
    """Point d'entrée ; voir le module pour les sous-commandes et les sorties."""
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as stop:
        return stop.code if isinstance(stop.code, int) else 2
    try:
        print(args.handler(run, args))
    except Refusal as refusal:
        print(f"refus — {refusal}")
        return 1
    except Divergence as divergence:
        print(f"relecture non conforme — {divergence}")
        return 1
    return 0


if __name__ == "__main__":
    # Sur un poste dont la page de code est cp1252, Python écrit un tube dans cet encodage : un
    # motif accentué arriverait illisible à la session qui le lit (`pipeline.config.md`,
    # « Qualité »).
    if isinstance(stdout := sys.stdout, io.TextIOWrapper):
        stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
