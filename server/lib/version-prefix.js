export function versionPrefix(path) {
  return path.replace(/^\/api\/v\d+\//, "/api/");
}
