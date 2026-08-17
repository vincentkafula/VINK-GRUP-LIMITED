package za.co.vink.terminal;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(P18QTerminalPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
