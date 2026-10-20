/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Em desenvolvimento o Next 16 bloqueia acessos que não vêm de localhost (ex.: iPhone pelo IP do Mac).
  // Libera as faixas de rede local para você abrir o app no celular.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "172.17.*.*", "172.18.*.*", "172.19.*.*", "172.2*.*.*", "172.30.*.*", "172.31.*.*", "*.local"],
};

export default nextConfig;
