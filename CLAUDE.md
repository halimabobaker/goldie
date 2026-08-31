# goldie

## Branching and releases

- All development happens on the `develop` branch. Base feature branches on `develop` and point PRs at `develop`, never at `main`.
- `main` holds released code only. To release: merge `develop` into `main`, tag the version, and publish the package from `main`.
- The GitHub default branch must stay `main` so `npx skills` installs the released version. Set PR bases to `develop` explicitly.

## References

- App Store screenshot specifications (required sizes per device, formats, limits):
  https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
