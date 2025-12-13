import { View } from "react-native";
import AllNeighborhoodsGallery from '../../components/AllNeighborhoodsGallery';

// In your screen:
export default function HomeScreen() {
  return (
    <View style={{ flex: 1 }}>
      <AllNeighborhoodsGallery />
    </View>
  );
}