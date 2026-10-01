/**
 * Skill bar plugin, node half.
 *
 * Pure UI plugin: the browser half ships through `exports["./client"]` and is
 * discovered through this package's `dsh.client` declaration. The empty apply
 * exists so the plugin occupies a real Loader entry, which is what puts the
 * browser row into the boot graph.
 *
 * @module dsh-client-ui-skill-bar
 */

/** Host plugin body — this surface has no host-side behavior. */
export function apply() {}
