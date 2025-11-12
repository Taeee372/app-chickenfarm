import Octicons from '@expo/vector-icons/Octicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const THRESHOLD_STORAGE_KEY = "fanThresholds";

const AutoControl = () => {
  // 기본 세팅값
  const DEFAULT_SETTINGS = {
    doorOpenTemp: 28,
    doorCloseTemp: 24,
    fanHumidityThreshold: 70,
    fanCO2Threshold: 5000,
    fanCOThreshold: 300,
    fanNH3Threshold: 100,
    fanNO2Threshold: 200
  };

  const router = useRouter();

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // 초기 DB 설정값 (변경 감지용)
  const [initialDbSettings, setInitialDbSettings] = useState(null);

  // 저장중 로딩 상태
  const [loading, setLoading] = useState(false);

  // 전체 로딩 화면(로딩중..)
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // 재시도 함수(1초 간격 10번 시도)
  const retryRequest = async (whatToRetry, maxRetries = 10) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await whatToRetry();
        return { success: true, data: result };
      } catch(e) {
        if (i < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    return { success: false };
  };

  // 설정 불러오기
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsInitialLoading(true);
    setLoadError(false);

    // 1. 스마트폰 저장소에서 CO, NH3, NO2 값 불러오기
    let localData = {};
    try {
      const str = await AsyncStorage.getItem(THRESHOLD_STORAGE_KEY);
      if (str) {
        localData = JSON.parse(str);
      }
    } catch(e) {}

    // 2. DB에서 설정 불러오기
    const result = await retryRequest(() =>
      axios.get('http://192.168.30.240:5000/api/settings/simple', {
        timeout: 5000
      })
    );

    if (result.success) {
      const data = result.data.data.data;
      if (data) {
        // DB 데이터 + 스마트폰 저장 데이터 합치기
        setSettings({
          ...DEFAULT_SETTINGS,
          ...data,
          ...localData
        });

        // 초기 DB 값 저장 (변경 감지용)
        setInitialDbSettings({
          doorOpenTemp: data.doorOpenTemp || DEFAULT_SETTINGS.doorOpenTemp,
          doorCloseTemp: data.doorCloseTemp || DEFAULT_SETTINGS.doorCloseTemp,
          fanHumidityThreshold: data.fanHumidityThreshold || DEFAULT_SETTINGS.fanHumidityThreshold,
          fanCO2Threshold: data.fanCO2Threshold || DEFAULT_SETTINGS.fanCO2Threshold
        });

        setLoadError(false);
      }
    } else {
      setLoadError(true);
    }

    setIsInitialLoading(false);
  };

  // 설정 저장
  const handleSave = async () => {
    setLoading(true);

    // 1. 현재 DB 설정값
    const currentDbSettings = {
      doorOpenTemp: settings.doorOpenTemp,
      doorCloseTemp: settings.doorCloseTemp,
      fanHumidityThreshold: settings.fanHumidityThreshold,
      fanCO2Threshold: settings.fanCO2Threshold
    };

    // 2. DB 값 변경 여부 체크
    const dbChanged = initialDbSettings && (
      initialDbSettings.doorOpenTemp !== currentDbSettings.doorOpenTemp ||
      initialDbSettings.doorCloseTemp !== currentDbSettings.doorCloseTemp ||
      initialDbSettings.fanHumidityThreshold !== currentDbSettings.fanHumidityThreshold ||
      initialDbSettings.fanCO2Threshold !== currentDbSettings.fanCO2Threshold
    );

    // 3. DB 값이 변경되었을 때만 DB 저장 및 적용
    if (dbChanged) {
      await retryRequest(() =>
        axios.post(
          'http://192.168.30.240:5000/api/settings/update',
          currentDbSettings,
          { timeout: 5000 }
        )
      );

      // 라즈베리파이에 적용
      await retryRequest(() =>
        axios.post(
          'http://192.168.30.240:5000/api/settings/apply',
          {},
          { timeout: 5000 }
        )
      );

      // 초기값 업데이트
      setInitialDbSettings(currentDbSettings);
    }

    // 4. 스마트폰 저장소에 CO, NH3, NO2 저장 (항상 실행)
    const localData = {
      fanCOThreshold: settings.fanCOThreshold,
      fanNH3Threshold: settings.fanNH3Threshold,
      fanNO2Threshold: settings.fanNO2Threshold
    };
    try {
      await AsyncStorage.setItem(THRESHOLD_STORAGE_KEY, JSON.stringify(localData));
    } catch(e) {}

    Alert.alert('저장 완료', '설정이 저장되었습니다.');
    setLoading(false);
  };

  // 기본값으로 초기화
  const handleReset = async () => {
    setLoading(true);

    // 1. 상태를 기본값으로 변경
    setSettings(DEFAULT_SETTINGS);

    // 2. DB에 기본값 저장
    const dbSettings = {
      doorOpenTemp: DEFAULT_SETTINGS.doorOpenTemp,
      doorCloseTemp: DEFAULT_SETTINGS.doorCloseTemp,
      fanHumidityThreshold: DEFAULT_SETTINGS.fanHumidityThreshold,
      fanCO2Threshold: DEFAULT_SETTINGS.fanCO2Threshold
    };

    const saveResult = await retryRequest(() =>
      axios.post(
        'http://192.168.30.240:5000/api/settings/update',
        dbSettings,
        { timeout: 5000 }
      )
    );

    if (!saveResult.success) {
      // Alert.alert('오류', '설정 저장에 실패했습니다.');
      // setLoading(false);
      return;
    }

    // 3. 라즈베리파이에 적용
    const applyResult = await retryRequest(() =>
      axios.post(
        'http://192.168.30.240:5000/api/settings/apply',
        {},
        { timeout: 5000 }
      )
    );

    if (applyResult.success) {
      Alert.alert('저장 완료', '설정이 저장되었습니다.');
    } else {
      // Alert.alert('경고', '설정은 저장되었으나 적용에 실패했습니다.');
    }

    // 4. 초기 DB 값도 기본값으로 업데이트
    setInitialDbSettings(dbSettings);

    // 5. 스마트폰 저장소에 기본값 저장
    const localData = {
      fanCOThreshold: DEFAULT_SETTINGS.fanCOThreshold,
      fanNH3Threshold: DEFAULT_SETTINGS.fanNH3Threshold,
      fanNO2Threshold: DEFAULT_SETTINGS.fanNO2Threshold
    };
    try {
      await AsyncStorage.setItem(THRESHOLD_STORAGE_KEY, JSON.stringify(localData));
    } catch(e) {
      console.log('스마트폰 저장소 저장 실패');
    }

    setLoading(false);
  };

  const handleChange = (key, value) => {
    const numValue = parseInt(value) || 0;
    setSettings(prev => ({
      ...prev,
      [key]: numValue
    }));
  };

  // 초기 로딩 화면
  if (isInitialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>설정을 불러오는 중...</Text>
      </View>
    );
  }

  // 에러 화면
  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <Octicons name="alert-fill" size={40} color="#ffc219ff" />
        <Text style={styles.errorTitle}>네트워크 오류</Text>
        <Text style={styles.errorText}>
          설정을 불러올 수 없습니다
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          onPress={loadSettings}
        >
          <Text style={styles.retryButtonText}>
            다시 시도하기
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>
            ← 뒤로 가기
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>환경 설정</Text>
      </View>

      {/* 문 제어 */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>문 제어</Text>

        <View style={styles.settingItem}>
          <Text style={styles.label}>문 열림 온도 (°C)</Text>
          <TextInput
            style={styles.input}
            value={String(settings.doorOpenTemp)}
            onChangeText={(text) => handleChange('doorOpenTemp', text)}
            keyboardType="numeric"
            placeholder="28"
            editable={!loading}
          />
          <Text style={styles.description}>
            이 온도 이상일 때 문이 열립니다
          </Text>
        </View>

        <View style={styles.settingItem}>
          <Text style={styles.label}>문 닫힘 온도 (°C)</Text>
          <TextInput
            style={styles.input}
            value={String(settings.doorCloseTemp)}
            onChangeText={(text) => handleChange('doorCloseTemp', text)}
            keyboardType="numeric"
            placeholder="24"
            editable={!loading}
          />
          <Text style={styles.description}>
            이 온도 이하일 때 문이 닫힙니다
          </Text>
        </View>
      </View>

      {/* 팬 제어 */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>팬 제어</Text>

        <View style={styles.settingItem}>
          <Text style={styles.label}>팬 가동 습도 기준 (%)</Text>
          <TextInput
            style={styles.input}
            value={String(settings.fanHumidityThreshold)}
            onChangeText={(text) => handleChange('fanHumidityThreshold', text)}
            keyboardType="numeric"
            placeholder="70"
            editable={!loading}
          />
          <Text style={styles.description}>
            이 습도 이상일 때 팬이 가동됩니다
          </Text>
        </View>

        <View style={styles.settingItem}>
          <Text style={styles.label}>팬 가동 CO₂ 기준 (ppm)</Text>
          <TextInput
            style={styles.input}
            value={String(settings.fanCO2Threshold)}
            onChangeText={(text) => handleChange('fanCO2Threshold', text)}
            keyboardType="numeric"
            placeholder="5000"
            editable={!loading}
          />
          <Text style={styles.description}>
            이 CO₂ 농도 초과 시 팬이 가동됩니다
          </Text>
        </View>

        {/* CO, NH3, NO2 - 스마트폰 저장소에만 저장 */}
        <View style={styles.settingItem}>
          <Text style={styles.label}>팬 가동 CO 기준 (ppm)</Text>
          <TextInput
            style={styles.input}
            value={String(settings.fanCOThreshold)}
            onChangeText={(text) => handleChange('fanCOThreshold', text)}
            keyboardType="numeric"
            placeholder="300"
            editable={!loading}
          />
          <Text style={styles.description}>
            이 CO 농도 초과 시 팬이 가동됩니다
          </Text>
        </View>

        <View style={styles.settingItem}>
          <Text style={styles.label}>팬 가동 NH₃ 기준 (ppm)</Text>
          <TextInput
            style={styles.input}
            value={String(settings.fanNH3Threshold)}
            onChangeText={(text) => handleChange('fanNH3Threshold', text)}
            keyboardType="numeric"
            placeholder="100"
            editable={!loading}
          />
          <Text style={styles.description}>
            이 NH₃ 농도 초과 시 팬이 가동됩니다
          </Text>
        </View>

        <View style={styles.settingItem}>
          <Text style={styles.label}>팬 가동 NO₂ 기준 (ppm)</Text>
          <TextInput
            style={styles.input}
            value={String(settings.fanNO2Threshold)}
            onChangeText={(text) => handleChange('fanNO2Threshold', text)}
            keyboardType="numeric"
            placeholder="200"
            editable={!loading}
          />
          <Text style={styles.description}>
            이 NO₂ 농도 초과 시 팬이 가동됩니다
          </Text>
        </View>
      </View>

      {/* 버튼 그룹 */}
      <View style={styles.buttonGroup}>

        <TouchableOpacity
          style={[styles.saveButton, loading && styles.disabledButton]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>
              설정 저장 및 적용
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resetButton, loading && styles.disabledButton]}
          onPress={handleReset}
          disabled={loading}
        >
          <Text style={styles.resetButtonText}>기본값으로 초기화</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resetButton, loading && styles.disabledButton]}
          onPress={() => router.replace('/control/ManualControl')}
          disabled={loading}
        >
          <Text style={styles.resetButtonText}>뒤로가기</Text>
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
};

export default AutoControl;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5'
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666'
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center'
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 15,
    minWidth: 200,
    alignItems: 'center'
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  backButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    minWidth: 200,
    alignItems: 'center'
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600'
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 30
  },
  card: {
    backgroundColor: '#fff',
    margin: 15,
    marginBottom: 0,
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333'
  },
  settingItem: {
    marginBottom: 20
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333'
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: '#fafafa'
  },
  description: {
    fontSize: 13,
    color: '#666',
    marginTop: 5,
    lineHeight: 18
  },
  buttonGroup: {
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingBottom: 50
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    padding: 15,
    minWidth: 100,
    alignItems: 'center'
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold'
  },
  resetButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd'
  },
  resetButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600'
  },
  disabledButton: {
    opacity: 0.5
  }
});
