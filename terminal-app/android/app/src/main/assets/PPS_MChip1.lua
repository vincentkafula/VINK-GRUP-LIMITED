function PPS_MChip1(AID, DB)
	data_sets = {}

	data_sets[TagOf_Acquirer_Identifier()] = ""
	data_sets[TagOf_Additional_Terminal_Capabilities()] = "0000000000"
	data_sets[TagOf_Application_Version_Number_Reader()] = "0002"
	data_sets[TagOf_Balance_Read_Before_Gen_AC()] = "NULL"
	data_sets[TagOf_Balance_Read_After_Gen_AC()] = "NULL"
	data_sets[TagOf_Card_Data_Input_Capability()] = "00"

	data_sets[TagOf_CVM_Capability_CVM_Required()] = "60"
	data_sets[TagOf_CVM_Capability_No_CVM_Required()] = "08"
	data_sets[TagOf_Default_UDOL()] = "9F6A04"
	data_sets[TagOf_DS_AC_Type()] = ""
	data_sets[TagOf_DS_Input_Card()] = ""
	data_sets[TagOf_DS_Input_Term()] = ""
	data_sets[TagOf_DS_ODS_Info()] = ""
	data_sets[TagOf_DS_ODS_Info_For_Reader()] = ""
	data_sets[TagOf_DS_ODS_Term()] = ""
	data_sets[TagOf_DS_Requested_Operator_ID()] = "NULL"
	data_sets[TagOf_DSVN_Term()] = ""
	data_sets[TagOf_Hold_Time_Value()] = "NULL"
	data_sets[TagOf_Interface_Device_Serial_Number()] = "3032313831313032"--Any value (terminal-dependent data item)
	data_sets[TagOf_Kernel_Configuration()] = "20"	--20 A0 20
	data_sets[TagOf_Kernel_ID()] = "02"
	data_sets[TagOf_Mag_stripe_Application_Version_Number_Reader()] = "0001"
	data_sets[TagOf_Mag_stripe_CVM_Capability_CVM_Required()] = "20" --20 F0 10
	data_sets[TagOf_Mag_stripe_CVM_Capability_No_CVM_Required()] = "F0" --F0 00
	data_sets[TagOf_Max_Lifetime_of_Torn_Transaction_Log_Record()] = "0000"
	data_sets[TagOf_Max_Number_of_Torn_Transaction_Log_Records()] = "00"
	data_sets[TagOf_Merchant_Category_Code()] = "5757"--Any value different from zero
	data_sets[TagOf_Merchant_Identifier()] = ""
	data_sets[TagOf_Merchant_Name_and_Location()] = ""
	data_sets[TagOf_Message_Hold_Time()] = "NULL"
	data_sets[TagOf_Mobile_Support_Indicator()] = ""
	data_sets[TagOf_Reader_Contactless_Floor_Limit()] = "10000"
	data_sets[TagOf_Reader_CTL_no_On_device_CVM()] = "30000"

	data_sets[TagOf_Reader_CTL_On_device_CVM()] = "50000"
	data_sets[TagOf_Reader_CVM_Required_Limit()] = "10" -- 00 ...
	data_sets[TagOf_Proceed_To_First_Write_Flag()] = "NULL"
	data_sets[TagOf_Security_Capability()] = "08"
	data_sets[TagOf_Tags_To_Read()] = "NULL"
	data_sets[TagOf_Tags_To_Write_After_Gen_AC()] = "NULL"
	data_sets[TagOf_Tags_To_Write_Before_Gen_AC()] = "NULL"
	data_sets[TagOf_Terminal_Action_Code_Default()] = "0000000000" -- 3
	data_sets[TagOf_Terminal_Action_Code_Denial()] = "0000000000" -- 3
	data_sets[TagOf_Terminal_Action_Code_Online()] = "0000000000" -- 3
	data_sets[TagOf_Terminal_Capabilities()] = ""
	data_sets[TagOf_Terminal_Country_Code()] = "0056"
	data_sets[TagOf_Terminal_Identification()] = ""
	data_sets[TagOf_Terminal_Risk_Management_Data()] = "6CFF000000000000" -- 6CFF0000 00000000 ...
	data_sets[TagOf_Terminal_Type()] = "00" -- 00 ...
	data_sets[TagOf_Time_Out_Value()] = "NULL"
	
	if (AID_Mastercard() == AID)
	then
		data_sets[TagOf_Kernel_Configuration()] = "20"
	elseif (AID_Maestro() == AID)
	then
		data_sets[TagOf_Kernel_Configuration()] = "A0"
	elseif (AID_Test() == AID)
	then
		data_sets[TagOf_Kernel_Configuration()] = "20"
	end

	if (DB[TagOf_Transaction_Type()] == "17" and AID_Mastercard() == AID)
	then
		data_sets[TagOf_Mag_stripe_CVM_Capability_CVM_Required()] = "20"
	elseif (DB[TagOf_Transaction_Type()] == "17" and AID_Maestro() == AID)
	then
		data_sets[TagOf_Mag_stripe_CVM_Capability_CVM_Required()] = "F0"
	else
		data_sets[TagOf_Mag_stripe_CVM_Capability_CVM_Required()] = "10"
	end

	if (DB[TagOf_Transaction_Type()] == "17" and AID_Maestro() == AID)
	then
		data_sets[TagOf_Mag_stripe_CVM_Capability_No_CVM_Required()] = "F0"
	else
		data_sets[TagOf_Mag_stripe_CVM_Capability_No_CVM_Required()] = "00"
	end

	if (DB[TagOf_Transaction_Type()] == "00")
	then
		if (AID_Mastercard() == AID)
		then
			data_sets[TagOf_Reader_CVM_Required_Limit()] = "1000"
		elseif (AID_Maestro() == AID)
		then
			data_sets[TagOf_Reader_CVM_Required_Limit()] = "30000"
		elseif (AID_Test() == AID)
		then
			data_sets[TagOf_Reader_CVM_Required_Limit()] = "1000"
		end
	else
		if (AID_Mastercard() == AID)
		then
			data_sets[TagOf_Reader_CVM_Required_Limit()] = "20000"
		elseif (AID_Maestro() == AID)
		then
			data_sets[TagOf_Reader_CVM_Required_Limit()] = "30000"
		elseif (AID_Test() == AID)
		then
			data_sets[TagOf_Reader_CVM_Required_Limit()] = "10000"
		end
	end

	if (AID_Mastercard() == AID and (DB[TagOf_Transaction_Type()] == "00" or DB[TagOf_Transaction_Type()] == "01" or DB[TagOf_Transaction_Type()] == "17"))
	then
		data_sets[TagOf_Terminal_Risk_Management_Data()] = "6CFF000000000000"
	elseif (AID_Mastercard() == AID and DB[TagOf_Transaction_Type()] == "09")
	then
		data_sets[TagOf_Terminal_Risk_Management_Data()] = ""
	elseif (AID_Maestro() == AID)
	then
		data_sets[TagOf_Terminal_Risk_Management_Data()] = "44FF800000000000"
	end

	if (DB[TagOf_Transaction_Type()] == "01")
	then
		data_sets[TagOf_Terminal_Type()] = "14"
	elseif (DB[TagOf_Transaction_Type()] == "17")
	then
		data_sets[TagOf_Terminal_Type()] = "11"
	elseif (DB[TagOf_Transaction_Type()] == "00" or DB[TagOf_Transaction_Type()] == "09" or DB[TagOf_Transaction_Type()] == "20")
	then
		data_sets[TagOf_Terminal_Type()] = "22"
	end

	data_sets[TagOf_Reader_Contactless_Floor_Limit()] = "199990"
	data_sets[TagOf_Reader_CTL_no_On_device_CVM()] = "999990"
	data_sets[TagOf_Reader_CTL_On_device_CVM()] = "999990"
	data_sets[TagOf_Reader_CVM_Required_Limit()] = "999990"
	data_sets[TagOf_Merchant_Category_Code()] = "4131"
	data_sets[TagOf_Kernel_Configuration()] = "80"
	data_sets[TagOf_Kernel_Configuration()] = StringOrString(data_sets[TagOf_Kernel_Configuration()], "10")
	data_sets[TagOf_Terminal_Country_Code()] = "0152"
	data_sets[TagOf_Terminal_Type()] = "25"
	data_sets[TagOf_Terminal_Risk_Management_Data()] = "0800808000000000"
	data_sets[TagOf_Terminal_Capabilities()] = "800848"
	data_sets[TagOf_Terminal_Action_Code_Default()] = "FC50808000"
	data_sets[TagOf_Terminal_Action_Code_Denial()] = "8440000000"
	data_sets[TagOf_Terminal_Action_Code_Online()] = "FC50808800"

	return data_sets
end
