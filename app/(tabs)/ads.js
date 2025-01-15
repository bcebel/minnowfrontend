import { AdMobBanner } from "expo-ads-admob";

function MyBannerAd() {
  return (
    <AdMobBanner
      bannerSize="banner"
      adUnitID="ca-app-pub-3239465181490887~3313370145" // Replace with your AdMob unit ID
      servePersonalizedAds={true} // Enable/disable personalized ads
      onDidFailToReceiveAdWithError={(error) => console.error(error)}
    />
  );
}
