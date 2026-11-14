{
  description = "t7d.dev (Tim-Conrad.github.io): dev shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      python = pkgs.python3.withPackages (ps: [
        ps.playwright # scripts/review checks
        ps.markdown # scripts/gen-tools.py
      ]);
    in
    {
      # `direnv allow` (or `nix develop`). Preview: `wt up` (compose.preview.yml).
      devShells.${system}.default = pkgs.mkShell {
        packages = [
          python
          pkgs.nodejs_22 # node --test, scripts/reels
          pkgs.git
          pkgs.gh # scripts/ship.sh, approve-host.sh
          pkgs.uv
        ];
        PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
        PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
        PYTHONDONTWRITEBYTECODE = "1";
      };
    };
}
