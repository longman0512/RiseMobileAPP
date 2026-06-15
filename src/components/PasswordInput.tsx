import React, { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
} & Pick<TextInputProps, 'returnKeyType' | 'onSubmitEditing'>;

export function PasswordInput({ value, onChangeText, placeholder, returnKeyType, onSubmitEditing }: Props) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View className="relative">
      <TextInput
        className="h-12 rounded-xl bg-zinc-900/60 border border-white/10 px-4 pr-12 text-white"
        secureTextEntry={!showPassword}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#71717a"
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        className="absolute right-0 top-0 h-12 w-12 items-center justify-center"
        onPress={() => setShowPassword((prev) => !prev)}
        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
        accessibilityRole="button"
      >
        {showPassword ? <EyeOff size={20} color="#71717a" /> : <Eye size={20} color="#71717a" />}
      </Pressable>
    </View>
  );
}
