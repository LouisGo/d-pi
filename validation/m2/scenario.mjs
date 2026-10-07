// Validate scope before a runner creates temporary data or launches native processes.
export function parseValidationScenario(args, scenarios) {
  const selectors = args.filter((arg) => arg.startsWith("--scenario"));
  if (
    selectors.length > 1 ||
    (selectors[0] && !selectors[0].startsWith("--scenario="))
  )
    throw Error("Use one --scenario=<name> selector");
  const scenario = selectors[0]?.slice("--scenario=".length) ?? "all";
  if (!Object.hasOwn(scenarios, scenario))
    throw Error(
      `Unknown validation scenario ${scenario}; choose ${Object.keys(scenarios).join(", ")}`,
    );
  const remaining = args.filter((arg) => !selectors.includes(arg));
  const paths = remaining.filter((arg) => !arg.startsWith("-"));
  if (paths.length > 1) throw Error("Supply at most one validation path");
  for (const flag of remaining.filter((arg) => arg.startsWith("-")))
    if (!scenarios[scenario].includes(flag))
      throw Error(
        `${flag} is not supported by validation scenario ${scenario}`,
      );
  return { scenario, path: paths[0] };
}
