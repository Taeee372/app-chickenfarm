import axios from 'axios'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button from '../../components/Button'
import Input from '../../components/Input'

const signin = () => {
  const [loginInfo, setLoginInfo] = useState({
    memId: "",
    memPw: "",
  })

  const loginBtn = async () => {
    try {
      const response = await axios.post("http://192.168.30.111:8080/api/member", 
        loginInfo
      )
      console.log('✅ 로그인 성공:', response.data)

      await SecureStore.setItemAsync("loginInfo", JSON.stringify(response.data))
      router.replace("/(tabs)/(home)")
    } catch (error) {
      console.error('로그인 실패:', error) /* dsfd */
      alert('로그인에 실패했습니다.')
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={styles.header}>
              <Text style={styles.title}>로그인</Text>
              <Text style={styles.subtitle}>환영합니다!</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>아이디</Text>
                <Input
                  placeholder="아이디를 입력하세요"
                  onChangeText={(id) => setLoginInfo({ ...loginInfo, memId: id })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>비밀번호</Text>
                <Input
                  placeholder="비밀번호를 입력하세요"
                  secureTextEntry
                  onChangeText={(pw) => setLoginInfo({ ...loginInfo, memPw: pw })}
                />
              </View>

              <Button
                title='로그인'
                onPress={loginBtn}
                variant='success'
                
              />

              <View style={styles.footer}>
                <TouchableOpacity>
                  <Text style={styles.linkText}>비밀번호 찾기</Text>
                </TouchableOpacity>
                <Text style={styles.divider}>|</Text>
                <TouchableOpacity onPress={() => router.push("authorization/signup")}>
                  <Text style={styles.linkText}>회원가입</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default signin

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  header: {
    marginBottom: 50,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  loginButton: {
    marginTop: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30,
  },
  linkText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    color: '#d1d5db',
    marginHorizontal: 15,
  },
})
