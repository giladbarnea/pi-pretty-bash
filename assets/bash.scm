; Derived from nvim-treesitter's Bash query (Apache-2.0); see THIRD_PARTY_NOTICES.md.
[
  "("
  ")"
  "{"
  "}"
  "["
  "]"
  "[["
  "]]"
  "(("
  "))"
] @punctuation.bracket

[
  ";"
  ";;"
  ";&"
  ";;&"
  "&"
] @punctuation.delimiter

[
  ">"
  ">>"
  "<"
  "<<"
  "&&"
  "|"
  "|&"
  "||"
  "="
  "+="
  "=~"
  "=="
  "!="
  "&>"
  "&>>"
  "<&"
  ">&"
  ">|"
  "<&-"
  ">&-"
  "<<-"
  "<<<"
  ".."
  "!"
] @operator

; Do *not* spell check strings since they typically have some sort of
; interpolation in them, or, are typically used for things like filenames, URLs,
; flags and file content.
[
  (string)
  (raw_string)
  (ansi_c_string)
  (heredoc_body)
] @string

[
  (heredoc_start)
  (heredoc_end)
] @label

(variable_assignment
  (word) @string)

(command
  argument: "$" @string) ; bare dollar

(concatenation
  (word) @string)

[
  "if"
  "then"
  "else"
  "elif"
  "fi"
  "case"
  "in"
  "esac"
] @keyword.conditional

[
  "for"
  "do"
  "done"
  "select"
  "until"
  "while"
] @keyword.repeat

[
  "declare"
  "typeset"
  "readonly"
  "local"
  "unset"
  "unsetenv"
] @keyword

"export" @keyword.import

"function" @keyword.function

(special_variable_name) @constant

(comment) @comment @spell

(test_operator) @operator

(command_substitution
  "$(" @punctuation.special
  ")" @punctuation.special)

(process_substitution
  [
    "<("
    ">("
  ] @punctuation.special
  ")" @punctuation.special)

(arithmetic_expansion
  [
    "$(("
    "(("
  ] @punctuation.special
  "))" @punctuation.special)

(arithmetic_expansion
  "," @punctuation.delimiter)

(ternary_expression
  [
    "?"
    ":"
  ] @keyword.conditional.ternary)

(binary_expression
  operator: _ @operator)

(unary_expression
  operator: _ @operator)

(postfix_expression
  operator: _ @operator)

(function_definition
  name: (word) @function)

(command_name
  (word) @function.call)

(command_name
  (word) @function.builtin
  (#any-of? @function.builtin
    "." ":" "alias" "bg" "bind" "break" "builtin" "caller" "cd" "command" "compgen" "complete"
    "compopt" "continue" "coproc" "dirs" "disown" "echo" "enable" "eval" "exec" "exit" "false" "fc"
    "fg" "getopts" "hash" "help" "history" "jobs" "kill" "let" "logout" "mapfile" "popd" "printf"
    "pushd" "pwd" "read" "readarray" "return" "set" "shift" "shopt" "source" "suspend" "test" "time"
    "times" "trap" "true" "type" "typeset" "ulimit" "umask" "unalias" "wait"))

(command
  argument: [
    (word) @variable.parameter
    (concatenation
      (word) @variable.parameter)
  ])

; help trap
(command
  name: (command_name
    (word) @_command)
  argument: (word) @string.special
  (#eq? @_command "trap")
  (#any-of? @string.special "EXIT" "DEBUG" "RETURN" "ERR"))

; trap -l
(command
  name: (command_name
    (word) @_command)
  argument: (word) @string.special
  (#any-of? @_command "trap" "kill")
  (#any-of? @string.special
    "SIGHUP" "SIGINT" "SIGQUIT" "SIGILL" "SIGTRAP" "SIGABRT" "SIGBUS" "SIGFPE" "SIGKILL" "SIGUSR1"
    "SIGSEGV" "SIGUSR2" "SIGPIPE" "SIGALRM" "SIGTERM" "SIGSTKFLT" "SIGCHLD" "SIGCONT" "SIGSTOP"
    "SIGTSTP" "SIGTTIN" "SIGTTOU" "SIGURG" "SIGXCPU" "SIGXFSZ" "SIGVTALRM" "SIGPROF" "SIGWINCH"
    "SIGIO" "SIGPWR" "SIGSYS" "SIGRTMIN" "SIGRTMIN+1" "SIGRTMIN+2" "SIGRTMIN+3" "SIGRTMIN+4"
    "SIGRTMIN+5" "SIGRTMIN+6" "SIGRTMIN+7" "SIGRTMIN+8" "SIGRTMIN+9" "SIGRTMIN+10" "SIGRTMIN+11"
    "SIGRTMIN+12" "SIGRTMIN+13" "SIGRTMIN+14" "SIGRTMIN+15" "SIGRTMAX-14" "SIGRTMAX-13"
    "SIGRTMAX-12" "SIGRTMAX-11" "SIGRTMAX-10" "SIGRTMAX-9" "SIGRTMAX-8" "SIGRTMAX-7" "SIGRTMAX-6"
    "SIGRTMAX-5" "SIGRTMAX-4" "SIGRTMAX-3" "SIGRTMAX-2" "SIGRTMAX-1" "SIGRTMAX"))

(declaration_command
  (word) @variable.parameter)

(unset_command
  (word) @variable.parameter)

(number) @number

(file_redirect
  (word) @string.special.path)

(herestring_redirect
  (word) @string)

(file_descriptor) @operator

(simple_expansion
  "$" @punctuation.special) @none

(expansion
  "${" @punctuation.special
  "}" @punctuation.special) @none

(expansion
  operator: _ @punctuation.special)

(expansion
  "@"
  .
  operator: _ @character.special)

((expansion
  (subscript
    index: (word) @character.special))
  (#any-of? @character.special "@" "*"))

"``" @punctuation.special

(variable_name) @variable

((variable_name) @constant
  (#match? @constant "^[A-Z][A-Z_0-9]*$"))

((variable_name) @variable.builtin
  (#any-of? @variable.builtin
    ; https://www.gnu.org/software/bash/manual/html_node/Bourne-Shell-Variables.html
    "CDPATH" "HOME" "IFS" "MAIL" "MAILPATH" "OPTARG" "OPTIND" "PATH" "PS1" "PS2"
    ; https://www.gnu.org/software/bash/manual/html_node/Bash-Variables.html
    "_" "BASH" "BASHOPTS" "BASHPID" "BASH_ALIASES" "BASH_ARGC" "BASH_ARGV" "BASH_ARGV0" "BASH_CMDS"
    "BASH_COMMAND" "BASH_COMPAT" "BASH_ENV" "BASH_EXECUTION_STRING" "BASH_LINENO"
    "BASH_LOADABLES_PATH" "BASH_REMATCH" "BASH_SOURCE" "BASH_SUBSHELL" "BASH_VERSINFO"
    "BASH_VERSION" "BASH_XTRACEFD" "CHILD_MAX" "COLUMNS" "COMP_CWORD" "COMP_LINE" "COMP_POINT"
    "COMP_TYPE" "COMP_KEY" "COMP_WORDBREAKS" "COMP_WORDS" "COMPREPLY" "COPROC" "DIRSTACK" "EMACS"
    "ENV" "EPOCHREALTIME" "EPOCHSECONDS" "EUID" "EXECIGNORE" "FCEDIT" "FIGNORE" "FUNCNAME"
    "FUNCNEST" "GLOBIGNORE" "GROUPS" "histchars" "HISTCMD" "HISTCONTROL" "HISTFILE" "HISTFILESIZE"
    "HISTIGNORE" "HISTSIZE" "HISTTIMEFORMAT" "HOSTFILE" "HOSTNAME" "HOSTTYPE" "IGNOREEOF" "INPUTRC"
    "INSIDE_EMACS" "LANG" "LC_ALL" "LC_COLLATE" "LC_CTYPE" "LC_MESSAGES" "LC_NUMERIC" "LC_TIME"
    "LINENO" "LINES" "MACHTYPE" "MAILCHECK" "MAPFILE" "OLDPWD" "OPTERR" "OSTYPE" "PIPESTATUS"
    "POSIXLY_CORRECT" "PPID" "PROMPT_COMMAND" "PROMPT_DIRTRIM" "PS0" "PS3" "PS4" "PWD" "RANDOM"
    "READLINE_ARGUMENT" "READLINE_LINE" "READLINE_MARK" "READLINE_POINT" "REPLY" "SECONDS" "SHELL"
    "SHELLOPTS" "SHLVL" "SRANDOM" "TIMEFORMAT" "TMOUT" "TMPDIR" "UID"))

((command
  name: (command_name
    (word) @_printf)
  .
  argument: (word) @_v
  .
  argument: (word) @variable)
  (#eq? @_printf "printf")
  (#eq? @_v "-v")
  (#match? @variable "^[a-zA-Z_][a-zA-Z0-9_]*$"))

(case_item
  value: (word) @variable.parameter)

[
  (regex)
  (extglob_pattern)
] @string.regexp

((program
  .
  (comment) @keyword.directive @nospell)
  (#match? @keyword.directive "^#![ \t]*/"))

; Appended to nvim-treesitter's bash highlights.scm. Later patterns win on equal ranges.

; Flags: `-n`, `--session`, `--format=...` (the flag head of a concatenation), and `--`.
(command argument: (word) @option (#match? @option "^-"))
(command argument: (concatenation . (word) @option (#match? @option "^-")))
(command argument: (number) @option (#match? @option "^-"))

; Unquoted globs.
((word) @glob (#match? @glob "[*?]"))

; F-Sy-H's generic subcommand rule for verb-first tools: the first operand, when no option precedes it.
(command
  name: (command_name (word) @_tool)
  .
  argument: (word) @subcommand
  (#any-of? @_tool "git" "gh" "docker" "kubectl" "cargo" "uv" "npm" "pnpm" "yarn" "bun" "brew" "go" "terraform" "systemctl" "herdr" "gcloud" "aws" "pip" "apt" "memo" "agent-browser")
  (#match? @subcommand "^[a-z][a-z0-9-]*$"))

; Assignment targets read as names, not values.
(variable_assignment name: (variable_name) @assign)

; Redirections are one category: operator, descriptor and `&1`-style targets.
(file_redirect [">" ">>" "<" "&>" "&>>" ">&" "<&" ">|" "<&-" ">&-"] @redirect)
(file_redirect descriptor: (file_descriptor) @redirect)
(file_redirect destination: (number) @redirect)
(heredoc_redirect ["<<" "<<-"] @redirect)
(herestring_redirect "<<<" @redirect)

; Heredoc bodies are data, not Bash. Expansions inside unquoted bodies keep their own captures.
(heredoc_body) @heredoc

; F-Sy-H's precommand rule: the first operand of a launcher is the launched command,
; but only when no option precedes it (an option might consume the next word).
(command
  name: (command_name (word) @_launcher)
  .
  argument: (word) @function.call
  (#any-of? @_launcher "sudo" "nohup" "exec" "command" "builtin" "time" "nice" "xargs" "env" "doas")
  (#not-match? @function.call "^-|="))
