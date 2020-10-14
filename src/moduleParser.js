export function replaceModules(code, callback) {
  return code
    .replace(
      /module\.exports\W.*/g,
      (str) => replaceParsed(str, parseExportCJS(str), callback),
    )
    .replace(
      /(export|import)\s+.*\s*from\s*.*/g,
      (str) => replaceParsed(str, parseESM(str), callback),
    )
    .replace(
      /.*\s*require\(.*/g,
      (str) => replaceParsed(str, parseImportCJS(str), callback),
    );
}

export function parseESM(code) {
  const matches = /(import|export)\s+((.*)\s*from\s*)?['"]([^'"]+)['"]/.exec(
    code.replaceAll("\n", " "),
  );

  if (!matches) {
    return;
  }

  const [, type, , names, path] = matches;

  return {
    path,
    [type]: names ? parseNamedCollection(names) : [],
  };
}

export function parseExportCJS(code) {
  const matches = /(module\.)?exports(\.(\w+))?\s*=\s*(.*)/.exec(
    code,
  );

  if (!matches) {
    return;
  }

  const [, , , name, value] = matches;

  if (!name) {
    return { export: [], value };
  }

  return { export: [{ name }], value };
}

export function parseImportCJS(code) {
  const matches =
    /((let|const|var)?\s*({[^}]+}|\S+)\s*=\s*)?require\(['"]([^'"]+)['"]\)/
      .exec(
        code,
      );

  if (!matches) {
    return;
  }

  const [, , , names, path] = matches;

  return {
    path,
    import: names ? parseNamedCollection(names) : [],
  };
}

export function stringify(mod) {
  const code = [];

  if (mod.export) {
    code.push("export");

    if (mod.export.length === 1 && mod.value) {
      if (mod.value.match(/(function\W|class\W)/)) {
        mod.value = mod.value.replace(
          /(function|class)/,
          `$1 ${mod.export[0].name}`,
        );
      } else {
        code.push("const");
        code.push(stringifyNamedCollection(mod.export));
        code.push("=");
      }
    } else if (mod.export.length) {
      code.push(stringifyNamedCollection(mod.export));
    }

    if (mod.value) {
      if (!mod.export.length) {
        code.push("default");
      }

      code.push(mod.value);
    }
  } else if (mod.import) {
    code.push("import");

    if (mod.import.length) {
      code.push(stringifyNamedCollection(mod.import));
    }
  }

  if (mod.path) {
    if (mod.import && !mod.import.length) {
      code.push(`"${mod.path}"`);
    } else {
      code.push(`from "${mod.path}"`);
    }
  }

  return code.join(" ");
}

function parseNamed(code) {
  const match = /^\{?\s*(\w+|\*)(\s*(as|\:)\s*(\w+))?\s*\}?/.exec(code);

  if (!match) {
    throw new Error(`Error parsing the name "${code}"`);
  }

  let [, name, , , as] = match;

  return as ? { name, as } : { name };
}

function parseNamedCollection(code) {
  const names = [];
  const pieces = code.split(",").map((name) => name.trim());
  let destructuring = false;

  while (pieces.length) {
    const name = pieces.shift();

    if (name.startsWith("{")) {
      destructuring = [];
      names.push(destructuring);
    }

    const parsedName = parseNamed(name);

    if (destructuring) {
      destructuring.push(parsedName);
    } else {
      names.push(parsedName);
    }

    if (name.endsWith("}")) {
      destructuring = false;
    }
  }

  return names;
}

function stringifyNamed(name) {
  const code = [name.name];

  if (name.as) {
    code.push(`as ${name.as}`);
  }

  return code.join(" ");
}

function stringifyNamedCollection(names) {
  const code = [];

  names.forEach((name) => {
    if (Array.isArray(name)) {
      const destr = [];
      destr.push("{");
      const subNames = [];
      name.forEach((n) => subNames.push(stringifyNamed(n)));
      destr.push(subNames.join(", "));
      destr.push("}");
      code.push(destr.join(" "));
      return;
    }
    code.push(stringifyNamed(name));
  });

  return code.join(", ");
}

function replaceParsed(str, parsed, callback) {
  if (!parsed) {
    console.error(`Error parsing ${str}`);
    return str;
  }

  if (callback) {
    callback(parsed);
  }

  return stringify(parsed);
}
