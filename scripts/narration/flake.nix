{
  # Dev shell for scripts/narration (local test narration with Qwen3-TTS). The site itself has no dependencies.
  # Python wheels such as torch need libstdc++ and zlib, which NixOS does not put on the default library path.
  #   nix develop ./scripts/narration -c uv run scripts/narration/narrate-local.py thoughts/<slug>
  description = "t7d.dev: local test narration";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { nixpkgs, ... }:
    let pkgs = nixpkgs.legacyPackages.x86_64-linux;
    in {
      devShells.x86_64-linux.default = pkgs.mkShell {
        packages = [ pkgs.python312 pkgs.uv pkgs.sox pkgs.nodejs_22 pkgs.chromium ];
        env = {
          UV_PYTHON = "${pkgs.python312}/bin/python3.12";
          UV_PYTHON_DOWNLOADS = "never";
          LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib pkgs.zlib pkgs.libsndfile pkgs.sox ];
        };
      };
    };
}
